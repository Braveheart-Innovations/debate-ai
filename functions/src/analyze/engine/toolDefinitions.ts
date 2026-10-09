/**
 * Tool definitions the server loop can offer, from the synced contract (the
 * web app owns them). Requested names outside SERVER_LOOP_TOOLS are dropped.
 */
import type { ToolDefinition } from '../contract/lib/ai/tools/types';
import { executeCodeTool } from '../contract/lib/ai/tools/built-in/execute-code';
import { fetchApiTool } from '../contract/lib/ai/tools/built-in/fetch-api';
import { fetchUrlTool } from '../contract/lib/ai/tools/built-in/fetch-url';
import { webSearchTool } from '../contract/lib/ai/tools/built-in/web-search';
import { readFileTool } from '../contract/lib/ai/tools/built-in/read-file';
import { writeOutputFileTool } from '../contract/lib/ai/tools/built-in/write-output-file';
import { salesforceMetadataAuditTool } from '../contract/lib/ai/tools/built-in/salesforce-metadata-audit';
import { salesforceReadSourceTool } from '../contract/lib/ai/tools/built-in/salesforce-read-source';
import { salesforceDocsLookupTool } from '../contract/lib/ai/tools/built-in/salesforce-docs-lookup';
import { requestSalesforceOrgEvidenceTool } from '../contract/lib/ai/tools/built-in/request-salesforce-org-evidence';
import { SERVER_LOOP_TOOLS } from './toolDispatch';

const DEFINITIONS: ToolDefinition[] = [
  executeCodeTool,
  fetchApiTool,
  fetchUrlTool,
  webSearchTool,
  readFileTool,
  writeOutputFileTool,
  salesforceMetadataAuditTool,
  salesforceReadSourceTool,
  salesforceDocsLookupTool,
  requestSalesforceOrgEvidenceTool,
];

export function getToolDefinitions(names: string[]): ToolDefinition[] {
  const wanted = new Set(names.filter((name) => SERVER_LOOP_TOOLS.has(name)));
  return DEFINITIONS.filter((tool) => wanted.has(tool.name));
}
