import type { Message } from '../../contract/types';
import { buildTurnRecord, readTurn, splitTurns, withTurnRecords } from '../turnRecords';

const ask = (id: string, content: string, timestamp: number): Message => ({ id, sender: 'You', senderType: 'user', content, timestamp });
const round = (id: string, content: string, calls: Array<[string, string, Record<string, unknown>]>, timestamp: number): Message => ({
  id,
  sender: 'Claude',
  senderType: 'ai',
  content,
  timestamp,
  metadata: {
    providerId: 'claude',
    aiId: 'ai-claude',
    ...(calls.length > 0
      ? { toolCalls: calls.map(([callId, name, args]) => ({ id: callId, type: 'function' as const, function: { name, arguments: JSON.stringify(args) } })) }
      : {}),
  },
});
const result = (callId: string, toolName: string, content: string, timestamp: number, success = true): Message => ({
  id: `toolresult_${callId}`,
  sender: 'tool',
  senderType: 'tool',
  content,
  timestamp,
  metadata: { isToolResult: true, toolCallId: callId, toolName, success },
});

const CODE = 'import pandas as pd\ndf = pd.read_json("/data/fetch_a.json")\nopen("/output/brief.json", "w").write(spec)';

/** Turn 1 fetches, builds a report and is reviewed; turn 2 asks for org evidence; turn 3 is under way. */
const session: Message[] = [
  ask('msg_1', 'Is a recession coming?', 1),
  round('run_1_aa_r0', 'Fetching unemployment.', [['c1', 'fetch_api', { url: 'https://api.stlouisfed.org/fred/series/observations', query_params: { series_id: 'UNRATE', file_type: 'json' }, api_key_ref: 'fred' }]], 2),
  result('c1', 'fetch_api', 'Fetched 13.7KB → saved to /data/fetch_a.json (provenance: /data/fetch_a.provenance.json)\n\nPreview:\n{"observations":[]}', 3),
  round('run_1_aa_r1', '', [['c2', 'execute_python', { code: CODE }]], 4),
  result('c2', 'execute_python', 'Executed successfully.\nOutput:\n/output/brief.json\n\nDurable generated files retained for this run:\n- /output/brief.json (24 KB)\n- /output/unrate.csv (2 KB)', 5),
  round('run_1_aa_r2', 'The brief is ready: unemployment is rising but below the Sahm threshold.', [], 6),
  { id: 'review-run_2_bb-0', sender: 'Reviewer', senderType: 'ai', content: 'Review: cite the Sahm rule source.', timestamp: 7, metadata: { providerId: 'openai', aiId: 'ai-gpt' } },
  ask('msg_2', 'Check the org too', 8),
  round('run_3_cc_r0', '', [['c3', 'request_salesforce_org_evidence', { investigation_prompt: 'Run SELECT COUNT() FROM Lead WHERE IsConverted = false in production.' }]], 9),
  result('c3', 'request_salesforce_org_evidence', 'Org evidence request presented to the user.', 10),
  round('run_3_cc_r1', 'I asked for org evidence: the lead counts decide the recommendation.', [], 11),
  ask('msg_3', 'Findings imported', 12),
  round('run_4_dd_r0', 'Verifying.', [['c4', 'execute_python', { code: 'print(1)' }]], 13),
  result('c4', 'execute_python', '1', 14),
];

describe('earlier turns as records', () => {
  it('sends earlier turns as the ask, a record and the reply, and the current turn exactly as it happened', () => {
    const history = withTurnRecords(session, 'msg_3');
    expect(history.map((message) => message.id)).toEqual([
      'msg_1', 'turn_record_1', 'run_1_aa_r2', 'review-run_2_bb-0',
      'msg_2', 'turn_record_2', 'run_3_cc_r1',
      'msg_3', 'run_4_dd_r0', 'toolresult_c4',
    ]);
    // No tool protocol from earlier turns; the current turn keeps its calls and results.
    expect(history.slice(0, 7).some((message) => message.metadata?.toolCalls || message.senderType === 'tool')).toBe(false);
    expect(history.slice(7)).toEqual(session.slice(11));
    expect(history.find((message) => message.id === 'turn_record_1')).toMatchObject({ senderType: 'user', sender: 'Symposium' });
  });

  it('records what the turn fetched, saved and ran, from the server\'s own lines', () => {
    const record = buildTurnRecord(splitTurns(session).turns[0]);
    expect(record).toContain('read_turn(turn=1)');
    expect(record).toContain('Tools run: fetch_api ×1, execute_python ×1.');
    expect(record).toContain('- https://api.stlouisfed.org/fred/series/observations?series_id=UNRATE&file_type=json → /data/fetch_a.json');
    expect(record).not.toContain('api_key_ref');
    expect(record).toContain('Saved in /output:\n- /output/brief.json (24 KB)\n- /output/unrate.csv (2 KB)');
    // The code isn't repeated: it's one read_turn call away.
    expect(record).not.toContain('pd.read_json');
  });

  it('keeps an org evidence brief in full, since the next turn imports its answers', () => {
    const record = buildTurnRecord(splitTurns(session).turns[1]);
    expect(record).toContain('Tools run: request_salesforce_org_evidence ×1.');
    expect(record).not.toContain('Other calls');
    expect(record).toContain('The org evidence brief it sent:\nRun SELECT COUNT() FROM Lead WHERE IsConverted = false in production.');
  });

  it('says when a turn failed to fetch or ended without a reply', () => {
    const stopped = [
      ask('msg_1', 'Get the data', 1),
      round('run_1_aa_r0', '', [['c1', 'fetch_url', { url: 'https://example.com/x' }]], 2),
      result('c1', 'fetch_url', 'HTTP 404', 3, false),
    ];
    const record = buildTurnRecord(splitTurns(stopped).turns[0]);
    expect(record).toContain('fetch_url ×1 (1 failed)');
    expect(record).toContain('- https://example.com/x → failed');
    expect(record).toContain('The turn ended without a reply.');
  });

  it('gives the same record every time, so a new turn leaves the earlier records unchanged for the cache', () => {
    const now = withTurnRecords(session, 'msg_3');
    const later = withTurnRecords([...session, round('run_4_dd_r1', 'Done.', [], 15), ask('msg_4', 'Thanks', 16)], 'msg_4');
    expect(later.slice(0, 7)).toEqual(now.slice(0, 7));
  });

  it('sends everything as it is without the turn\'s message (a teammate\'s run)', () => {
    expect(withTurnRecords(session, undefined)).toBe(session);
    expect(withTurnRecords(session, 'msg_missing')).toBe(session);
  });
});

describe('read_turn', () => {
  it('lists an earlier turn\'s rounds', () => {
    const read = readTurn(session, 'msg_3', { turn: 1 });
    expect(read.success).toBe(true);
    expect(read.content).toContain('Turn 1, the user\'s message:\nIs a recession coming?');
    expect(read.content).toContain('Its 3 rounds');
    expect(read.content).toContain('1. fetch_api(url=https://api.stlouisfed.org/fred/series/observations, query_params={"series_id":"UNRATE","file_type":"json"}) →');
    expect(read.content).toContain('2. execute_python (3 lines: import pandas as pd) →');
    expect(read.content).toContain('3. reply');
  });

  it('returns a round exactly as it was sent: the code and the whole result', () => {
    const read = readTurn(session, 'msg_3', { turn: 1, round: 2 });
    expect(read.content).toContain(`\`\`\`python\n${CODE}\n\`\`\``);
    expect(read.content).toContain('Durable generated files retained for this run:\n- /output/brief.json (24 KB)');
  });

  it('says which turns there are, and that the current one is already in context', () => {
    expect(readTurn(session, 'msg_3', { turn: 3 })).toEqual({ success: false, content: expect.stringContaining('the earlier turns are 1 to 2') });
    expect(readTurn(session, 'msg_3', { turn: 1, round: 9 })).toEqual({ success: false, content: 'Turn 1 has rounds 1 to 3.' });
    expect(readTurn(session.slice(0, 1), 'msg_1', { turn: 1 }).content).toContain('first turn');
  });
});
