import { executeCodeTool } from '../contract/lib/ai/tools/built-in/execute-code';
import { fetchApiTool } from '../contract/lib/ai/tools/built-in/fetch-api';
import { salesforceReadSourceTool } from '../contract/lib/ai/tools/built-in/salesforce-read-source';
import { requestSalesforceOrgEvidenceTool } from '../contract/lib/ai/tools/built-in/request-salesforce-org-evidence';

// The synced tool definitions load at runtime (type-only imports erased) and
// carry the schemas the server loop will send.
describe('synced tool definitions', () => {
  it.each([
    [executeCodeTool, 'execute_python'],
    [fetchApiTool, 'fetch_api'],
    [salesforceReadSourceTool, 'salesforce_read_source'],
    [requestSalesforceOrgEvidenceTool, 'request_salesforce_org_evidence'],
  ])('%#: %s', (tool, name) => {
    expect(tool.name).toBe(name);
    expect(tool.parameters.type).toBe('object');
    expect(tool.description.length).toBeGreaterThan(20);
  });
});
