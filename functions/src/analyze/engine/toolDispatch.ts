/**
 * Runs one model-requested tool for the server loop, the way the browser's
 * toolDispatcher did: the browser's client tools (ClientToolExecutor) against
 * the session sandbox, server tools through the ported ServerToolExecutor
 * (backed by dispatchServerTool instead of the executeTool callable).
 */
import type { ToolCall, ToolResult } from '../contract/lib/ai/tools/types';
import { dispatchServerTool } from '../../tools';
import { createSandboxBridge } from './sandboxBridge';
import { createSandboxFiles } from './tools/sandboxFiles';
import { executePythonTool } from './tools/executePythonTool';
import { executeReadFileTool } from './tools/executeReadFileTool';
import { executeWriteOutputFileTool } from './tools/executeWriteOutputFileTool';
import { executeSalesforceMetadataAuditTool } from './tools/executeSalesforceMetadataAuditTool';
import { executeSalesforceReadSourceTool } from './tools/executeSalesforceReadSourceTool';
import { executeRequestSalesforceOrgEvidenceTool } from './tools/executeRequestSalesforceOrgEvidenceTool';
import { packageSalesforceDocsLookupEvidence } from './tools/executeSalesforceDocsLookupTool';
import { ServerToolExecutor } from './tools/serverToolExecutor';
import { buildFetchProvenance } from './tools/provenance';
import { DatasetRegistry } from './dataset/DatasetRegistry';

/** The browser's client tools (ClientToolExecutor), run here against the session sandbox. */
const SANDBOX_TOOLS = new Set([
  'execute_python',
  'read_file',
  'write_output_file',
  'salesforce_metadata_audit',
  'salesforce_read_source',
  'request_salesforce_org_evidence',
]);
/** Tools that ran on the server for the browser too (ServerToolExecutor). */
const SERVER_TOOLS = new Set(['fetch_api', 'fetch_url', 'web_search', 'salesforce_docs_lookup']);
/** Every tool the server loop executes. query_sql is deleted, not ported (Phase 3 decision 3). */
export const SERVER_LOOP_TOOLS = new Set([...SANDBOX_TOOLS, ...SERVER_TOOLS]);

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
  const files = createSandboxFiles(uid, sandboxSessionKey);
  // One registry per step, as one per page load was in the browser.
  const datasetRegistry = new DatasetRegistry();

  const serverTools = new ServerToolExecutor({
    sandbox: {
      getSessionKey: () => sandboxSessionKey,
      mountFile: files.mountFile,
    },
    datasetRegistry,
    buildFetchProvenance,
    packageSalesforceDocsLookupEvidence,
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
      switch (name) {
        case 'execute_python':
          return await executePythonTool(sandbox, call.id, typeof args.code === 'string' ? args.code : '', context.signal);
        case 'read_file':
          return await executeReadFileTool(files, call.id, args);
        case 'write_output_file':
          return await executeWriteOutputFileTool(files, call.id, args);
        case 'salesforce_metadata_audit':
          return await executeSalesforceMetadataAuditTool(files, call.id, args);
        case 'salesforce_read_source':
          return await executeSalesforceReadSourceTool(files, call.id, args);
        case 'request_salesforce_org_evidence':
          return executeRequestSalesforceOrgEvidenceTool(call.id, args);
        default:
          return await serverTools.executeServerTool(call.id, name, args);
      }
    } catch (error) {
      return {
        toolCallId: call.id,
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  };
}
