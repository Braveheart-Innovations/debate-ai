/**
 * Earlier turns as records (symposium-ai-web docs/analyze-context-design.md, "History").
 *
 * Every round resends the session. The turn in progress goes in exactly as it
 * happened; each earlier turn goes in as the user's message, a record built
 * from its messages, and the final reply. An earlier turn the current one
 * continues goes in exactly as it happened too (`unfinished`). The record names what the turn
 * fetched, saved and ran; its code, tool calls and results stay one call away
 * (`read_turn`). Nothing is cut by size and nothing is summarized by a model:
 * the June 2026 caps made the model think its work was gone, and it rebuilt it.
 * The same messages always give the same record, so the history stays a stable
 * prefix for the prompt cache.
 */
import type { Message } from '../contract/types';
import type { ToolCall, ToolDefinition } from '../contract/lib/ai/tools/types';
import { ASK_USER_TOOL_NAME, ORG_EVIDENCE_TOOL_NAME } from '../team/teamTools';

export const READ_TURN_TOOL_NAME = 'read_turn';

/** One user message and everything up to the next: the operator's rounds and any review. */
export interface Turn {
  /** 1-based, in session order. */
  number: number;
  ask: Message;
  messages: Message[];
}

/** An operator round: a model message, with the results of its tool calls. */
interface Round {
  message: Message;
  results: Message[];
}

export function splitTurns(messages: Message[]): { before: Message[]; turns: Turn[] } {
  const before: Message[] = [];
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.senderType === 'user') turns.push({ number: turns.length + 1, ask: message, messages: [] });
    else if (turns.length > 0) turns[turns.length - 1].messages.push(message);
    else before.push(message);
  }
  return { before, turns };
}

/** The operator's round messages are `<runId>_r<n>` (round.ts); reviews and checks are `review-…` and `verify-…`. */
function isOperatorMessage(message: Message): boolean {
  return message.senderType === 'tool'
    || (message.senderType === 'ai' && (/_r\d+$/.test(message.id) || (message.metadata?.toolCalls?.length ?? 0) > 0));
}

function roundsOf(turn: Turn): Round[] {
  const rounds: Round[] = [];
  for (const message of turn.messages) {
    if (!isOperatorMessage(message)) continue;
    if (message.senderType === 'tool') rounds[rounds.length - 1]?.results.push(message);
    else rounds.push({ message, results: [] });
  }
  return rounds;
}

function callsOf(message: Message): ToolCall[] {
  return (message.metadata?.toolCalls ?? []) as ToolCall[];
}

function argsOf(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.function.arguments || '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function resultFor(round: Round, call: ToolCall): Message | undefined {
  return round.results.find((result) => result.metadata?.toolCallId === call.id);
}

function failed(result: Message | undefined): boolean {
  return !result || result.metadata?.success === false;
}

/** A fetch as the AI asked for it: the URL with its query, never the key reference. */
function describeFetch(args: Record<string, unknown>): string {
  const url = typeof args.url === 'string' ? args.url : '(no url)';
  const params = args.query_params && typeof args.query_params === 'object' ? args.query_params as Record<string, unknown> : {};
  const query = Object.entries(params).map(([key, value]) => `${key}=${String(value)}`).join('&');
  const method = typeof args.method === 'string' && args.method.toUpperCase() !== 'GET' ? `${args.method.toUpperCase()} ` : '';
  return `${method}${url}${query ? `${url.includes('?') ? '&' : '?'}${query}` : ''}`;
}

/** A call's arguments in one line, for the record and read_turn's list: strings are cut short here, never in a round. */
function describeArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([key]) => key !== 'api_key_ref')
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const oneLine = text.replace(/\s+/g, ' ').trim();
      return `${key}=${oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine}`;
    })
    .join(', ');
}

/** Files the server says a result saved under /output (its own lines, not anything a print mentions). */
function savedFiles(result: Message): string[] {
  const content = result.content || '';
  const files: string[] = [];
  const retained = content.indexOf('Durable generated files retained for this run:');
  if (retained >= 0) {
    for (const line of content.slice(retained).split('\n').slice(1)) {
      const match = /^- (\/output\/\S+(?: \([^)]*\))?)/.exec(line);
      if (!match) break;
      files.push(match[1]);
    }
  }
  for (const match of content.matchAll(/^Files it saved: (.+)$/gm)) {
    files.push(...match[1].split(', ').filter((path) => path.startsWith('/output/')));
  }
  return files;
}

function fetchedPath(result: Message): string | undefined {
  return /saved to (\/data\/\S+)/.exec(result.content || '')?.[1];
}

/** Calls that end the turn to wait for the user (round.ts endTurnReply, the org evidence card). */
const WAITING_TOOLS = new Set([ORG_EVIDENCE_TOOL_NAME, ASK_USER_TOOL_NAME]);

/**
 * A turn the next one picks up: it ended waiting for the user (org evidence, a
 * question) or before its reply (stopped or failed, its last round still
 * calling tools). Its findings are in its tool results, which a record leaves
 * out, so the turns that continue it get it in full.
 */
function unfinished(turn: Turn): boolean {
  const rounds = roundsOf(turn);
  const last = rounds[rounds.length - 1];
  if (!last) return true;
  const calls = rounds.flatMap((round) => callsOf(round.message));
  return callsOf(last.message).length > 0 || WAITING_TOOLS.has(calls[calls.length - 1]?.function.name ?? '');
}

function finalReply(rounds: Round[]): Message | undefined {
  return [...rounds].reverse().find((round) => round.message.content?.trim())?.message;
}

/** The record of one earlier turn, as a user-role note the request merges after the user's message. */
export function buildTurnRecord(turn: Turn): string {
  const rounds = roundsOf(turn);
  const counts = new Map<string, { calls: number; failed: number }>();
  const fetches: string[] = [];
  const saved = new Map<string, string>();
  const otherCalls: string[] = [];
  const evidenceBriefs: string[] = [];

  for (const round of rounds) {
    for (const call of callsOf(round.message)) {
      const name = call.function.name;
      const result = resultFor(round, call);
      const count = counts.get(name) ?? { calls: 0, failed: 0 };
      count.calls += 1;
      if (failed(result)) count.failed += 1;
      counts.set(name, count);
      const args = argsOf(call);
      if (name === 'fetch_api' || name === 'fetch_url') {
        const path = result && !failed(result) ? fetchedPath(result) : undefined;
        fetches.push(`- ${describeFetch(args)} → ${path ?? 'failed'}`);
      } else if (name === ORG_EVIDENCE_TOOL_NAME && !failed(result) && typeof args.investigation_prompt === 'string') {
        // The next turn imports its answers: the brief goes in whole.
        evidenceBriefs.push(args.investigation_prompt);
      } else if (name !== 'execute_python' && name !== 'write_output_file' && name !== 'read_file' && name !== READ_TURN_TOOL_NAME) {
        otherCalls.push(`- ${name}(${describeArgs(args)})${failed(result) ? ' (failed)' : ''}`);
      }
      if (result && !failed(result)) {
        for (const file of savedFiles(result)) saved.set(file.split(' (')[0], file);
      }
    }
  }

  const lines = [
    `[Symposium's record of turn ${turn.number}, not the user's words: what the assistant did for the message above. Its code, tool calls and results aren't repeated here: read_turn(turn=${turn.number}) lists its rounds and returns any one in full.]`,
  ];
  if (counts.size === 0) lines.push('No tools ran.');
  else {
    lines.push(`Tools run: ${[...counts].map(([name, { calls, failed: failures }]) =>
      `${name} ×${calls}${failures > 0 ? ` (${failures} failed)` : ''}`).join(', ')}.`);
  }
  if (fetches.length > 0) lines.push('Fetched into /data:', ...fetches);
  if (saved.size > 0) lines.push('Saved in /output:', ...[...saved.values()].map((file) => `- ${file}`));
  if (otherCalls.length > 0) lines.push('Other calls:', ...otherCalls);
  for (const brief of evidenceBriefs) lines.push('The org evidence brief it sent:', brief);
  if (!finalReply(rounds)) lines.push('The turn ended without a reply.');
  return lines.join('\n');
}

/**
 * The history a round sends: earlier turns as records; the current turn (from
 * the user message that started this run) and the unfinished turns it
 * continues in full. Without that message, all of it in full.
 */
export function withTurnRecords(messages: Message[], currentAskId: string | undefined): Message[] {
  const { before, turns } = splitTurns(messages);
  const current = turns.findIndex((turn) => turn.ask.id === currentAskId);
  if (current < 0) return messages;
  let firstInFull = current;
  while (firstInFull > 0 && unfinished(turns[firstInFull - 1])) firstInFull -= 1;

  const history: Message[] = [...before];
  for (const turn of turns.slice(0, firstInFull)) {
    const rounds = roundsOf(turn);
    const reply = finalReply(rounds);
    history.push(turn.ask, {
      id: `turn_record_${turn.number}`,
      sender: 'Symposium',
      senderType: 'user',
      content: buildTurnRecord(turn),
      timestamp: turn.ask.timestamp,
    });
    if (reply) {
      const metadata = { ...reply.metadata };
      delete metadata.toolCalls;
      history.push({ ...reply, metadata });
    }
    history.push(...turn.messages.filter((message) => !isOperatorMessage(message)));
  }
  for (const turn of turns.slice(firstInFull)) history.push(turn.ask, ...turn.messages);
  return history;
}

function describeRound(round: Round, index: number): string {
  const calls = callsOf(round.message);
  if (calls.length === 0) return `${index}. reply (${(round.message.content || '').length.toLocaleString('en-US')} characters)`;
  return `${index}. ${calls.map((call) => {
    const args = argsOf(call);
    const result = resultFor(round, call);
    const code = typeof args.code === 'string' ? args.code.trim().split('\n') : undefined;
    const what = call.function.name === 'execute_python' && code
      ? `execute_python (${code.length} lines: ${code[0].slice(0, 80)})`
      : `${call.function.name}(${describeArgs(args)})`;
    return `${what} → ${failed(result) ? 'failed' : `${(result?.content || '').length.toLocaleString('en-US')} characters`}`;
  }).join('; ')}`;
}

function renderRound(round: Round): string {
  const parts: string[] = [];
  if (round.message.content?.trim()) parts.push(`You wrote:\n${round.message.content}`);
  for (const call of callsOf(round.message)) {
    const args = argsOf(call);
    parts.push(call.function.name === 'execute_python' && typeof args.code === 'string'
      ? `Call: execute_python\n\`\`\`python\n${args.code}\n\`\`\``
      : `Call: ${call.function.name} ${call.function.arguments || '{}'}`);
    const result = resultFor(round, call);
    parts.push(result ? `Result:\n${result.content || '(empty)'}` : 'Result: none was recorded.');
  }
  return parts.join('\n\n');
}

/** read_turn: an earlier turn's rounds as a list, or one round exactly as it was sent. */
export function readTurn(messages: Message[], currentAskId: string | undefined, args: Record<string, unknown>): { success: boolean; content: string } {
  const { turns } = splitTurns(messages);
  const current = turns.find((turn) => turn.ask.id === currentAskId)?.number ?? turns.length + 1;
  const number = Number(args.turn);
  const turn = turns.find((candidate) => candidate.number === number);
  if (!Number.isInteger(number) || !turn || number >= current) {
    return {
      success: false,
      content: current > 1
        ? `There is no earlier turn ${String(args.turn)}: the earlier turns are 1 to ${current - 1}. This turn's own work is already in your context.`
        : 'This is the session\'s first turn: there are no earlier turns.',
    };
  }
  const rounds = roundsOf(turn);
  if (args.round === undefined || args.round === null) {
    return {
      success: true,
      content: [
        `Turn ${turn.number}, the user's message:`,
        turn.ask.content,
        '',
        `Its ${rounds.length} round${rounds.length === 1 ? '' : 's'} (read_turn(turn=${turn.number}, round=N) returns one in full):`,
        ...rounds.map((round, index) => describeRound(round, index + 1)),
      ].join('\n'),
    };
  }
  const index = Number(args.round);
  const round = Number.isInteger(index) ? rounds[index - 1] : undefined;
  if (!round) return { success: false, content: `Turn ${turn.number} has rounds 1 to ${rounds.length}.` };
  return { success: true, content: `Turn ${turn.number}, round ${index} of ${rounds.length}:\n\n${renderRound(round)}` };
}

export function buildReadTurnTool(): ToolDefinition {
  return {
    name: READ_TURN_TOOL_NAME,
    description: 'Read an earlier turn of this session. Earlier turns are in your context as records: the user\'s message, what was fetched and saved, and the final reply, without the code, tool calls and results. A turn this one continues (it asked for org evidence or a question, or stopped) is in full. With only `turn`, this lists the turn\'s rounds; with `round` too, it returns that round exactly as it happened: what you wrote, each call with its arguments (Python code included) and each result.',
    parameters: {
      type: 'object',
      properties: {
        turn: { type: 'integer', description: 'The turn\'s number, as its record names it.' },
        round: { type: 'integer', description: 'A round from the turn\'s list; leave it out for the list.' },
      },
      required: ['turn'],
      additionalProperties: false,
    },
    category: 'compute',
    execution: 'orchestrator',
    requiresConfirmation: false,
  };
}
