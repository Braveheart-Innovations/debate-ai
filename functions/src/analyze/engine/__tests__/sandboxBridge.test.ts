const mockExecute = jest.fn();
const mockInterrupt = jest.fn();

jest.mock('../../../sandbox/callables', () => ({
  getSandboxService: () => ({ execute: mockExecute, interrupt: mockInterrupt, readFile: jest.fn() }),
}));

import { SandboxCancelledError, createSandboxBridge } from '../sandboxBridge';

function remote(overrides: Record<string, unknown> = {}) {
  return { success: true, stdout: 'ok', images: [], htmlOutputs: [], dataOutputs: [], environmentReset: false, ...overrides };
}

describe('createSandboxBridge', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockInterrupt.mockReset();
  });

  it('passes a normal result through', async () => {
    mockExecute.mockResolvedValue(remote({ result: 'Done' }));
    await expect(createSandboxBridge('u', 's').execute('print(1)')).resolves.toMatchObject({ success: true, stdout: 'ok' });
    expect(mockInterrupt).not.toHaveBeenCalled();
  });

  it('reports a stopped cell as stopped, not the interrupt\'s connection error', async () => {
    const controller = new AbortController();
    mockInterrupt.mockResolvedValue('restarted');
    mockExecute.mockImplementation(async () => {
      controller.abort();
      return remote({
        success: false,
        stdout: 'partial',
        error: 'Python environment failed to start: UnexpectedEndOfExecution: Connection to the execution was closed before the execution was finished',
        dataOutputs: [{ filename: 'a.csv', path: '/output/a.csv', size: 1, base64: 'YQ==' }],
      });
    });

    const result = await createSandboxBridge('u', 's', 'k1').execute('long()', { signal: controller.signal });
    expect(mockInterrupt).toHaveBeenCalledWith('u', 's', 'k1');
    expect(result).toMatchObject({
      success: false,
      stdout: 'partial',
      error: 'Stopped by the user. The Python session was restarted, so variables were cleared; files in /uploads, /output and /data are kept.',
      dataOutputs: [{ filename: 'a.csv', size: 1, base64: 'YQ==' }],
    });
  });

  it('says variables are kept when the interrupt worked', async () => {
    const controller = new AbortController();
    mockInterrupt.mockResolvedValue('interrupted');
    mockExecute.mockImplementation(async () => {
      controller.abort();
      return remote({ success: false, error: 'KeyboardInterrupt' });
    });
    const result = await createSandboxBridge('u', 's').execute('long()', { signal: controller.signal });
    expect(result.error).toBe('Stopped by the user. Variables and files are kept.');
  });

  it('runs nothing once already stopped', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createSandboxBridge('u', 's').execute('x', { signal: controller.signal })).rejects.toBeInstanceOf(SandboxCancelledError);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
