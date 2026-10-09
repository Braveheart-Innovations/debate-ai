/** Moved from symposium-ai-web src/context/analyze/artifactFilesystemHydration.ts (Phase 3 Step 5), unchanged. */
import type { Artifact, BundleManifest } from '../contract/types/notebook';

export interface SandboxArtifactMountBridge {
  mountFile: (filename: string, data: ArrayBuffer, path?: string) => Promise<string>;
}

const OFFLOADED_ARTIFACT_SENTINELS = new Set(['__BUNDLE_TOO_LARGE__', '__PAYLOAD_OFFLOADED__']);

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeTextArtifactData(data: string): ArrayBuffer {
  return toExactArrayBuffer(new TextEncoder().encode(data));
}

function decodeBase64ArtifactData(data: string): ArrayBuffer {
  const normalized = data.includes(',') ? data.split(',').pop() || '' : data;
  const binary = atob(normalized.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return toExactArrayBuffer(bytes);
}

function safeOutputPath(filename: string | undefined): string | null {
  const normalized = (filename || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^output\//, '');
  const parts = normalized
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..');
  if (parts.length === 0) return null;
  return `/output/${parts.join('/')}`;
}

function filenameFromPath(path: string): string {
  return path.split('/').filter(Boolean).pop() || 'artifact';
}

function isRawTextArtifact(artifact: Artifact): boolean {
  if (
    artifact.type === 'html'
    || artifact.type === 'code'
    || artifact.type === 'analysis_artifact_spec'
    || artifact.type === 'report_spec'
    || artifact.type.startsWith('salesforce_')
  ) {
    return true;
  }
  return false;
}

function artifactDataToArrayBuffer(artifact: Artifact): ArrayBuffer {
  if (isRawTextArtifact(artifact)) {
    return encodeTextArtifactData(artifact.data);
  }

  try {
    return decodeBase64ArtifactData(artifact.data);
  } catch {
    return encodeTextArtifactData(artifact.data);
  }
}

function bundleFileDataToArrayBuffer(file: BundleManifest['files'][string]): ArrayBuffer {
  if (file.isBase64) {
    return decodeBase64ArtifactData(file.content);
  }
  return encodeTextArtifactData(file.content);
}

export async function mountArtifactsToSandbox(
  sandbox: SandboxArtifactMountBridge,
  artifacts: Artifact[],
): Promise<void> {
  for (const artifact of artifacts) {
    if (!artifact.data || OFFLOADED_ARTIFACT_SENTINELS.has(artifact.data)) {
      continue;
    }

    if (artifact.type === 'artifact_bundle') {
      try {
        const manifest = JSON.parse(artifact.data) as BundleManifest;
        for (const [filename, file] of Object.entries(manifest.files || {})) {
          const outputPath = safeOutputPath(filename);
          if (!outputPath) continue;
          await sandbox.mountFile(filenameFromPath(outputPath), bundleFileDataToArrayBuffer(file), outputPath);
        }
      } catch (err) {
        console.warn(`Failed to restore artifact bundle ${artifact.name} to the sandbox:`, err);
      }
      continue;
    }

    const outputPath = safeOutputPath(artifact.name);
    if (!outputPath) continue;

    try {
      await sandbox.mountFile(filenameFromPath(outputPath), artifactDataToArrayBuffer(artifact), outputPath);
    } catch (err) {
      console.warn(`Failed to restore artifact ${artifact.name} to the sandbox:`, err);
    }
  }
}
