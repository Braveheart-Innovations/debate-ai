import { buildChildRun } from '../teamStore';
import type { RunConfig } from '../../engine/runStore';
import { normalizeAnalyzeOutputSelection } from '../../contract/types/analyze';

const base: RunConfig = {
  provider: 'claude', model: 'claude-sonnet-5-5', aiId: 'op', aiName: 'Claude', systemPrompt: 'OPERATOR',
  toolNames: ['execute_python', 'delegate'], sandboxSessionKey: 'session-1',
  outputSelection: normalizeAnalyzeOutputSelection(undefined),
  subagentSystemPrompt: 'TEAMMATE',
  guides: { report: 'The report contract.', model: 'How a model works.' },
};

describe('buildChildRun', () => {
  it('gives a teammate the operator\'s guides with the teammate prompt', () => {
    const { run } = buildChildRun({
      uid: 'u', sessionId: 'session-1', baseConfig: base,
      ai: { id: 'gpt', name: 'ChatGPT', provider: 'openai', model: 'gpt-5.6' },
      handle: 'teammate1', purpose: 'delegated', task: 'Fit the model.', parentToolCallId: 'd1', now: 1,
    });
    expect(run.config).toMatchObject({ systemPrompt: 'TEAMMATE', guides: base.guides });
    expect(run.config.toolNames).toEqual(['execute_python']);
  });
});
