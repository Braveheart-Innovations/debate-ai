/** Ported from symposium-ai-web src/services/analyze/artifacts/__tests__/teamPanelNote.test.ts (Phase 3), logic unchanged. */
import type { AgentRunView } from '../../team/types';
import type { AnalysisArtifactSpecV1 } from '../../contract/types/analysis-artifact-spec';
import { TEAM_PANEL_BLOCK_ID, findTeamPanel, injectTeamPanelNote, teamPanelNoteText } from '../teamPanelNote';

function run(overrides: Partial<AgentRunView>): AgentRunView {
  return {
    runId: 'r', parentToolCallId: 'c', agentName: 'Gemini', provider: 'google', model: 'Gemini 3.8 Flash',
    purpose: 'delegated', title: 't', task: 't', status: 'completed', toolExecutions: [], startedAt: 1,
    ...overrides,
  };
}

describe('findTeamPanel', () => {
  it('finds tasks two or more teammates ran; a split is not a panel', () => {
    expect(findTeamPanel([
      run({ runId: 'a', assignmentKey: 'c:1' }),
      run({ runId: 'b', assignmentKey: 'c:2', agentName: 'Kimi', model: 'Kimi K3' }),
    ], 'ChatGPT')).toBeNull();

    expect(findTeamPanel([
      run({ runId: 'a', assignmentKey: 'c:1' }),
      run({ runId: 'b', assignmentKey: 'c:1', agentName: 'Kimi', model: 'Kimi K3', status: 'stopped' }),
      run({ runId: 'v', purpose: 'review_check', agentName: 'Claude', model: 'Sonnet' }),
    ], 'ChatGPT')).toEqual({
      operatorName: 'ChatGPT',
      panelists: [
        { name: 'Gemini', model: 'Gemini 3.8 Flash', status: 'completed' },
        { name: 'Kimi', model: 'Kimi K3', status: 'stopped' },
      ],
    });
  });
});

describe('injectTeamPanelNote', () => {
  const record = {
    operatorName: 'ChatGPT',
    panelists: [
      { name: 'Gemini', model: 'Gemini 3.8 Flash', status: 'completed' as const },
      { name: 'Kimi', model: 'Kimi K3', status: 'stopped' as const },
      { name: 'Claude', model: 'Claude Sonnet 5.5', status: 'completed' as const },
    ],
  };

  it('names each panelist, marking runs that did not complete', () => {
    expect(teamPanelNoteText(record)).toBe(
      '**Independent panel.** Gemini (Gemini 3.8 Flash), Kimi (Kimi K3, stopped) and Claude (Claude Sonnet 5.5) each worked this question separately; ChatGPT reconciled their findings.',
    );
  });

  it('puts the note first on the first page, once', () => {
    const spec: AnalysisArtifactSpecV1 = {
      version: 1, kind: 'analysis_artifact_spec', title: 'T', summary: 'S',
      pages: [
        { slug: 'a', title: 'A', blocks: [{ kind: 'markdown', markdown: 'x' }] },
        { slug: 'b', title: 'B', blocks: [] },
      ],
    };
    const twice = injectTeamPanelNote(injectTeamPanelNote(spec, record), record);
    expect(twice.pages[0].blocks.map((block) => block.id ?? block.kind)).toEqual([TEAM_PANEL_BLOCK_ID, 'markdown']);
    expect(twice.pages[1].blocks).toEqual([]);
  });
});
