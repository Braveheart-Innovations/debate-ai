/**
 * The artifact helpers capture uses, gathered the way the web's
 * services/artifacts barrel exposes them (so the ported tests mock one module).
 * Local and cloud persistence and thumbnails are not here: the server writes
 * artifacts through captureRound, and thumbnails are made by the client the
 * first time an artifact is shown (Phase 3 decision 4).
 */
export { withArtifactPreviewMetadata } from '../contract/services/artifacts/ArtifactPreviewMetadataService';
export { isReportMaterialArtifact } from '../contract/services/artifacts/artifactVisibility';
export { deriveArtifactLineage, type ArtifactLineageFields } from '../contract/services/artifacts/artifactLineage';
