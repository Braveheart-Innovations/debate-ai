/**
 * A hand save from the Diagram view (analyzeSaveDiagram): the edited file
 * becomes the next version of the diagram artifact, with no agent turn.
 *
 *  - The review that checks the agent's saves checks this one; a file it
 *    refuses isn't saved.
 *  - The edit started from a version. When a newer one was saved meanwhile (by
 *    the agent, or in another tab), the save is refused unless the user chose
 *    to save over it.
 *  - No save while an operator turn runs: the turn's capture numbers versions
 *    from what it loaded, so a save in between could repeat a number.
 *  - The sandbox isn't touched. The next round copies new artifacts into it
 *    (SessionFilesSync), so the agent reads what the user saved.
 */
import { randomBytes } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import type { Artifact } from '../contract/types/notebook';
import {
  diagramFileText,
  diagramMetadata,
  reviewDiagramText,
} from '../contract/services/analyze/diagrams/diagramFile';
import { deriveArtifactLineage, withArtifactPreviewMetadata } from '../capture/artifacts';
import { artifactRef, latestByName, loadArtifactsNamed, prepareArtifactRecord, removeUndefined } from '../engine/sessionStore';
import { OPERATOR_ACTIVE, type AnalyzeRunDoc } from '../engine/runStore';
import { SessionBusyError } from '../engine/turns';

export class DiagramNotFoundError extends Error {
  constructor() {
    super('That diagram is no longer in this session.');
  }
}

/** The review refused the edited file. */
export class DiagramReviewError extends Error {
  constructor(readonly problems: string[]) {
    super(`The diagram can't be saved: ${problems.join('; ')}`);
  }
}

/** A newer version was saved after the edit started. */
export class DiagramStaleError extends Error {
  constructor(readonly latestArtifactId: string, readonly latestVersion: number) {
    super(`A newer version of this diagram (v${latestVersion}) was saved after you started editing.`);
  }
}

export interface DiagramSaveResult {
  artifactId: string;
  versionNumber: number;
  warnings: string[];
}

/**
 * The saved version as an artifact, from the version the edit started from
 * and every version of the file. Pure: the callable loads and writes.
 */
export function buildDiagramSave(input: {
  sessionId: string;
  base: Artifact;
  versions: Artifact[];
  text: string;
  overwrite: boolean;
  savedAt: number;
  newId: string;
}): { artifact: Artifact; warnings: string[] } {
  const { sessionId, base, versions, savedAt, newId } = input;
  if (base.type !== 'diagram') throw new DiagramNotFoundError();
  const review = reviewDiagramText(input.text);
  if (!review.diagram) throw new DiagramReviewError(review.problems);

  const latest = latestByName(versions, base.name) ?? base;
  if (latest.id !== base.id && !input.overwrite) {
    throw new DiagramStaleError(latest.id, latest.metadata?.versionNumber ?? 1);
  }

  const data = diagramFileText(review.diagram);
  const lineage = deriveArtifactLineage(latest, versions);
  const artifact = withArtifactPreviewMetadata(removeUndefined({
    id: newId,
    cellId: `diagram-save-${newId}`,
    sessionId,
    name: base.name,
    type: 'diagram',
    mimeType: 'application/json',
    data,
    createdAt: savedAt,
    provenance: latest.provenance,
    metadata: removeUndefined({
      fileSize: Buffer.byteLength(data, 'utf8'),
      artifactDisposition: latest.metadata?.artifactDisposition,
      artifactGroupId: latest.metadata?.artifactGroupId,
      ...lineage,
      diagram: diagramMetadata(review.diagram, review.warnings, true),
    }),
  }) as Artifact);
  return { artifact, warnings: review.warnings };
}

export interface SaveDiagramDeps {
  now: () => number;
  newId: () => string;
}

const defaultDeps: SaveDiagramDeps = {
  now: () => Date.now(),
  newId: () => `artifact-diagram-${Date.now()}-${randomBytes(6).toString('hex')}`,
};

export async function saveDiagram(
  uid: string,
  sessionId: string,
  input: { baseArtifactId: string; text: string; overwrite: boolean },
  deps: SaveDiagramDeps = defaultDeps,
): Promise<DiagramSaveResult> {
  const baseSnap = await artifactRef(uid, sessionId, input.baseArtifactId).get();
  if (!baseSnap.exists) throw new DiagramNotFoundError();
  const base = baseSnap.data() as Artifact;

  const operators = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`)
    .where('status', 'in', OPERATOR_ACTIVE)
    .get();
  if (operators.docs.some((doc) => (doc.data() as AnalyzeRunDoc).kind === 'operator')) throw new SessionBusyError();

  const versions = await loadArtifactsNamed(uid, sessionId, [base.name]);
  const { artifact, warnings } = buildDiagramSave({
    sessionId,
    base,
    versions,
    text: input.text,
    overwrite: input.overwrite,
    savedAt: deps.now(),
    newId: deps.newId(),
  });
  await artifactRef(uid, sessionId, artifact.id).set(await prepareArtifactRecord(uid, sessionId, artifact), { merge: true });
  return { artifactId: artifact.id, versionNumber: artifact.metadata?.versionNumber ?? 1, warnings };
}
