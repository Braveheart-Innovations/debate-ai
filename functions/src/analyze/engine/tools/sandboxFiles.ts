/**
 * The session sandbox's filesystem, shaped like the browser's sandboxService
 * file methods (web services/sandbox/SandboxService.ts readFile / listFiles /
 * mountFile). The ported tools and Salesforce services take it injected where
 * the browser imported the singleton.
 */
import { getSandboxService } from '../../../sandbox/callables';
import { readWholeFile, timedSandboxCall, type SandboxTimeListener } from '../sandboxBridge';

export interface SandboxFileInfo {
  name: string;
  path: string;
  size?: number;
  isDirectory?: boolean;
}

export interface SandboxFiles {
  readFile: (path: string) => Promise<ArrayBuffer>;
  listFiles: (dir?: string) => Promise<SandboxFileInfo[]>;
  mountFile: (filename: string, data: ArrayBuffer, path?: string) => Promise<string>;
}

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function createSandboxFiles(uid: string, sessionKey: string, onTime?: SandboxTimeListener): SandboxFiles {
  return {
    readFile: (path) => timedSandboxCall(onTime, async () => toArrayBuffer(await readWholeFile(uid, sessionKey, path))),
    listFiles: (dir = '/uploads') => timedSandboxCall(onTime, () => getSandboxService().listFiles(uid, sessionKey, dir)),
    mountFile: (filename, data, path) => timedSandboxCall(onTime, async () => {
      const target = path || `/uploads/${filename}`;
      await getSandboxService().writeFile(uid, sessionKey, {
        path: target,
        base64: Buffer.from(data).toString('base64'),
      });
      return target;
    }),
  };
}
