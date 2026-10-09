/**
 * Runs one model-requested tool for the server loop, the way the browser's
 * toolDispatcher did: execute_python in the session sandbox, server tools
 * through the ported ServerToolExecutor (backed by dispatchServerTool instead
 * of the executeTool callable).
 */
import type { ToolCall, ToolResult } from '../contract/lib/ai/tools/types';
import { getSandboxService } from '../../sandbox/callables';
import { dispatchServerTool } from '../../tools';
import { createSandboxBridge } from './sandboxBridge';
import { executePythonTool } from './tools/executePythonTool';
import { ServerToolExecutor } from './tools/serverToolExecutor';
import { buildFetchProvenance } from './tools/provenance';
import { DatasetRegistry } from './dataset/DatasetRegistry';

/** Tools the server loop executes today (Step 2). Others arrive with their ports. */
export const SERVER_LOOP_TOOLS = new Set(['execute_python', 'fetch_api', 'fetch_url', 'web_search']);

export interface ToolDispatchContext {
  uid: string;
  sandboxSessionKey: string;
  /** A subagent's own Python kernel (the operator uses the default one). */
  kernelKey?: string;
  keyValue: string;
  signal: AbortSignal;
}

export function createToolDispatcher(context: ToolDispatchContext): (call: ToolCall) => Promise<ToolResult> {
  const { uid, sandboxSessionKey, keyValue } = context;
  const sandbox = createSandboxBridge(uid, sandboxSessionKey, context.kernelKey);
  // One registry per step, as one per page load was in the browser.
  const datasetRegistry = new DatasetRegistry();

  const serverTools = new ServerToolExecutor({
    sandbox: {
      getSessionKey: () => sandboxSessionKey,
      mountFile: async (filename, data, path) => {
        const target = path || `/uploads/${filename}`;
        await getSandboxService().writeFile(uid, sandboxSessionKey, {
          path: target,
          base64: Buffer.from(data).toString('base64'),
        });
        return target;
      },
    },
    datasetRegistry,
    buildFetchProvenance,
    packageSalesforceDocsLookupEvidence: async (toolCallId) => ({
      toolCallId,
      success: false,
      error: 'salesforce_docs_lookup is not available in the server loop yet.',
    }),
    executeToolCallable: async (toolName, toolCallId, args, sandboxTarget) => {
      const result = await dispatchServerTool(uid, { toolName, toolCallId, args, sandboxTarget }, keyValue);
      return { success: result.success, content: result.content, error: result.error, metadata: result.metadata };
    },
  });

  // Mirrors web toolDispatcher.executeSingleToolCall (messages and catch-all unchanged).
  return async (call: ToolCall): Promise<ToolResult> => {
    const { name, arguments: argsString } = call.function;

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsString || '{}');
    } catch {
      console.warn('[analyzeRun] Malformed tool call JSON:', {
        toolName: name,
        argsLength: argsString?.length,
        argsPreview: argsString?.slice(0, 200),
      });
      return { toolCallId: call.id, success: false, error: 'Invalid tool arguments (malformed JSON)' };
    }

    if (!SERVER_LOOP_TOOLS.has(name)) {
      return { toolCallId: call.id, success: false, error: `Unknown tool: ${name}` };
    }

    try {
      if (name === 'execute_python') {
        return await executePythonTool(sandbox, call.id, typeof args.code === 'string' ? args.code : '', context.signal);
      }
      return await serverTools.executeServerTool(call.id, name, args);
    } catch (error) {
      return {
        toolCallId: call.id,
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  };
}
