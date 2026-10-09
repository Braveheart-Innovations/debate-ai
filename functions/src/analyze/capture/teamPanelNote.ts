/** Ported from symposium-ai-web src/services/analyze/artifacts/teamPanelNote.ts (Phase 3), logic unchanged. */
import type { AgentRunView } from '../team/types';
import type { AnalysisArtifactCalloutBlock, AnalysisArtifactSpecV1 } from '../contract/types/analysis-artifact-spec';

/**
 * App-side method note (NOT model-authored) for reports built on an
 * independent panel: several teammates each ran the same approved task. The
 * operator writes the reconciliation itself; this records who was on the panel.
 * Baked into the spec at capture (like source provenance) and carried to later
 * versions of the same report via artifact metadata.
 */

export interface TeamPanelRecord {
  operatorName: string;
  panelists: Array<{ name: string; model: string; status: AgentRunView['status'] }>;
}

export const TEAM_PANEL_BLOCK_ID = 'app-team-panel';

/** The panel in this turn's runs: every delegated task two or more teammates ran. Null when none. */
export function findTeamPanel(runs: AgentRunView[], operatorName: string): TeamPanelRecord | null {
  const byAssignment = new Map<string, AgentRunView[]>();
  for (const run of runs) {
    if (run.purpose !== 'delegated' || !run.assignmentKey) continue;
    byAssignment.set(run.assignmentKey, [...(byAssignment.get(run.assignmentKey) ?? []), run]);
  }
  const panelists: TeamPanelRecord['panelists'] = [];
  for (const group of byAssignment.values()) {
    if (group.length < 2) continue;
    for (const run of group) {
      if (!panelists.some((p) => p.name === run.agentName && p.model === run.model)) {
        panelists.push({ name: run.agentName, model: run.model, status: run.status });
      }
    }
  }
  return panelists.length >= 2 ? { operatorName, panelists } : null;
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function teamPanelNoteText(record: TeamPanelRecord): string {
  const names = record.panelists.map((p) => (
    `${p.name} (${p.model}${p.status === 'completed' ? '' : `, ${p.status}`})`
  ));
  return `**Independent panel.** ${joinNames(names)} each worked this question separately; ${record.operatorName} reconciled their findings.`;
}

/** The spec with the panel note as the first block of its first page (replacing an earlier copy). */
export function injectTeamPanelNote(spec: AnalysisArtifactSpecV1, record: TeamPanelRecord): AnalysisArtifactSpecV1 {
  if (spec.pages.length === 0) return spec;
  const note: AnalysisArtifactCalloutBlock = {
    id: TEAM_PANEL_BLOCK_ID,
    kind: 'callout',
    tone: 'info',
    body: teamPanelNoteText(record),
  };
  const [first, ...rest] = spec.pages;
  const blocks = [note, ...first.blocks.filter((block) => block.id !== TEAM_PANEL_BLOCK_ID)];
  return { ...spec, pages: [{ ...first, blocks }, ...rest] };
}
