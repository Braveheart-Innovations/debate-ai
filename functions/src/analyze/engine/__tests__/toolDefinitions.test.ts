import { getToolDefinitions, toolNamesForTurn } from '../toolDefinitions';
import { SERVER_LOOP_TOOLS } from '../toolDispatch';

describe('server loop tool definitions', () => {
  it('offers a definition for every tool the loop executes, and nothing else', () => {
    const names = getToolDefinitions([...SERVER_LOOP_TOOLS, 'query_sql', 'assemble_html_bundle']).map((tool) => tool.name);
    expect(new Set(names)).toEqual(SERVER_LOOP_TOOLS);
  });

  it('keeps only the requested tools', () => {
    expect(getToolDefinitions(['read_file', 'salesforce_read_source']).map((tool) => tool.name))
      .toEqual(['read_file', 'salesforce_read_source']);
  });

  it('offers no Salesforce tool without a Salesforce workspace, the docs lookup included', () => {
    const requested = ['execute_python', 'salesforce_metadata_audit', 'salesforce_read_source', 'salesforce_docs_lookup', 'request_salesforce_org_evidence'];
    expect(toolNamesForTurn(requested, false)).toEqual(['execute_python']);
    expect(toolNamesForTurn(requested, true)).toEqual(requested);
  });
});
