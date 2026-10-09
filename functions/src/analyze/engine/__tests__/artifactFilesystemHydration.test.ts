import { mountArtifactsToSandbox } from '../artifactFilesystemHydration';
import type { Artifact } from '../../contract/types/notebook';

function artifact(overrides: Partial<Artifact>): Artifact {
  return {
    id: overrides.id || 'artifact-1',
    cellId: overrides.cellId || 'message-1',
    sessionId: overrides.sessionId || 'session-1',
    name: overrides.name || 'artifact.html',
    type: overrides.type || 'html',
    mimeType: overrides.mimeType || 'text/html',
    data: overrides.data || '',
    createdAt: overrides.createdAt || 1,
    metadata: overrides.metadata,
    profile: overrides.profile,
    provenance: overrides.provenance,
    policyReport: overrides.policyReport,
    dependencies: overrides.dependencies,
  };
}

function decodeText(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(new Uint8Array(buffer));
}

type MountFileMock = (filename: string, data: ArrayBuffer, path?: string) => Promise<string>;

describe('mountArtifactsToSandbox', () => {
  it('mounts restored text artifacts and bundle files into /output', async () => {
    const mountFile = jest.fn<ReturnType<MountFileMock>, Parameters<MountFileMock>>();
    mountFile.mockResolvedValue('/output/file');

    await mountArtifactsToSandbox(
      { mountFile },
      [
        artifact({
          id: 'artifact-html',
          name: 'presentation.html',
          type: 'html',
          data: '<html><body>Presentation</body></html>',
        }),
        artifact({
          id: 'artifact-bundle',
          name: 'bundle-index.html',
          type: 'artifact_bundle',
          mimeType: 'application/json',
          data: JSON.stringify({
            version: 1,
            entryPoint: 'index.html',
            files: {
              'index.html': {
                mimeType: 'text/html',
                content: '<html><body><img src="assets/chart.png"></body></html>',
                size: 55,
              },
              '/output/assets/chart.png': {
                mimeType: 'image/png',
                content: 'iVBORw0KGgo=',
                isBase64: true,
                size: 8,
              },
            },
          }),
        }),
      ],
    );

    expect(mountFile).toHaveBeenCalledWith(
      'presentation.html',
      expect.any(ArrayBuffer),
      '/output/presentation.html',
    );
    expect(mountFile).toHaveBeenCalledWith(
      'index.html',
      expect.any(ArrayBuffer),
      '/output/index.html',
    );
    expect(mountFile).toHaveBeenCalledWith(
      'chart.png',
      expect.any(ArrayBuffer),
      '/output/assets/chart.png',
    );

    const presentationCall = mountFile.mock.calls.find(([, , path]) => path === '/output/presentation.html');
    if (!presentationCall) throw new Error('Expected presentation artifact to be mounted');
    const presentationBuffer = presentationCall[1];
    expect(decodeText(presentationBuffer)).toBe('<html><body>Presentation</body></html>');

    const chartCall = mountFile.mock.calls.find(([, , path]) => path === '/output/assets/chart.png');
    if (!chartCall) throw new Error('Expected bundled chart artifact to be mounted');
    const chartBuffer = chartCall[1];
    expect(Array.from(new Uint8Array(chartBuffer))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('skips offloaded artifact placeholders because no payload is available to remount', async () => {
    const mountFile = jest.fn<ReturnType<MountFileMock>, Parameters<MountFileMock>>();
    mountFile.mockResolvedValue('/output/file');

    await mountArtifactsToSandbox(
      { mountFile },
      [
        artifact({
          id: 'offloaded-artifact',
          name: 'large-bundle.html',
          type: 'html',
          data: '__PAYLOAD_OFFLOADED__',
        }),
      ],
    );

    expect(mountFile).not.toHaveBeenCalled();
  });
});
