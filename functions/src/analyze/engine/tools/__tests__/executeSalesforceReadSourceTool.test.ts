import {
  SOURCE_PAGE_LINES,
  SOURCE_SEARCH_MATCHES,
  readSalesforceSource,
} from '../executeSalesforceReadSourceTool';
import type { SalesforceSourceFile } from '../../../salesforce/SalesforceMetadataService';

function file(path: string, content: string): SalesforceSourceFile {
  return { path, content, sizeBytes: content.length };
}

const reparenting = file('force-app/main/default/classes/LeadReparentingInvocable.cls', [
  'public with sharing class LeadReparentingInvocable {',
  '  @InvocableMethod',
  '  public static void reparent(List<Id> leadIds) {',
  '    Database.merge(master, duplicate);',
  '  }',
  '}',
].join('\n'));
const reparentingMeta = file('force-app/main/default/classes/LeadReparentingInvocable.cls-meta.xml', '<ApexClass><apiVersion>62.0</apiVersion></ApexClass>');
const convert = file('force-app/main/default/classes/ConvertLeadsInvocable.cls', 'Database.LeadConvertResult r = Database.convertLead(lc);');
const emailField = file('force-app/main/default/objects/Lead/fields/Email__c.field-meta.xml', '<CustomField><fullName>Email__c</fullName></CustomField>');
const files = [reparenting, reparentingMeta, convert, emailField];

function content(result: ReturnType<typeof readSalesforceSource>): string {
  if (!result.ok) throw new Error(result.error);
  return result.content;
}

describe('readSalesforceSource', () => {
  it('reads a component\'s code with line numbers and lists its other files', () => {
    const text = content(readSalesforceSource(files, { component: 'LeadReparentingInvocable' }));
    expect(text).toContain('force-app/main/default/classes/LeadReparentingInvocable.cls — lines 1-6 of 6');
    expect(text).toContain('4 |     Database.merge(master, duplicate);');
    expect(text).toContain('Other files for component "LeadReparentingInvocable":\n- force-app/main/default/classes/LeadReparentingInvocable.cls-meta.xml');
  });

  it('matches components case-insensitively and fields as Object.Field', () => {
    expect(content(readSalesforceSource(files, { component: 'leadreparentinginvocable' }))).toContain('LeadReparentingInvocable.cls —');
    expect(content(readSalesforceSource(files, { component: 'Lead.Email__c' }))).toContain('Email__c.field-meta.xml — lines 1-1 of 1');
  });

  it('reads by full path, path suffix, or file name', () => {
    for (const path of [
      '/force-app/main/default/classes/ConvertLeadsInvocable.cls',
      'classes/ConvertLeadsInvocable.cls',
      'ConvertLeadsInvocable.cls',
    ]) {
      expect(content(readSalesforceSource(files, { path }))).toContain('Database.convertLead(lc)');
    }
  });

  it('reads a line range, and pages long files', () => {
    expect(content(readSalesforceSource(files, { component: 'LeadReparentingInvocable', start_line: 3, end_line: 4 })))
      .toMatch(/lines 3-4 of 6\n3 \| {3}public static void reparent[^\n]*\n4 \| {5}Database\.merge/);

    const long = file('classes/Big.cls', Array.from({ length: SOURCE_PAGE_LINES + 50 }, (_, i) => `line ${i + 1}`).join('\n'));
    const first = content(readSalesforceSource([long], { path: 'Big.cls' }));
    expect(first).toContain(`lines 1-${SOURCE_PAGE_LINES} of ${SOURCE_PAGE_LINES + 50}`);
    expect(first).toContain(`call again with path="classes/Big.cls", start_line=${SOURCE_PAGE_LINES + 1}`);
    const second = content(readSalesforceSource([long], { path: 'Big.cls', start_line: SOURCE_PAGE_LINES + 1 }));
    expect(second).toContain(`line ${SOURCE_PAGE_LINES + 50}`);
    expect(second).not.toContain('call again');
  });

  it('searches the workspace with a pattern and cites path:line', () => {
    const text = content(readSalesforceSource(files, { pattern: 'Database\\.(merge|convertLead)' }));
    expect(text).toContain('2 matching lines');
    expect(text).toContain('force-app/main/default/classes/LeadReparentingInvocable.cls:4: Database.merge(master, duplicate);');
    expect(text).toContain('force-app/main/default/classes/ConvertLeadsInvocable.cls:1:');
  });

  it('scopes a search to a component, treats an invalid regex as text, and reports no matches', () => {
    expect(content(readSalesforceSource(files, { component: 'ConvertLeadsInvocable', pattern: 'merge' }))).toContain('No lines match');
    expect(content(readSalesforceSource([file('a.cls', 'x = foo(;')], { pattern: 'foo(' }))).toContain('a.cls:1: x = foo(;');
  });

  it('caps search results and says how many more there were', () => {
    const many = file('classes/Many.cls', Array.from({ length: SOURCE_SEARCH_MATCHES + 5 }, () => 'insert lead;').join('\n'));
    const text = content(readSalesforceSource([many], { pattern: 'insert' }));
    expect(text).toContain(`${SOURCE_SEARCH_MATCHES + 5} matching lines`);
    expect(text).toContain('5 more matches not shown');
  });

  it('explains what went wrong instead of guessing', () => {
    expect(readSalesforceSource([], { component: 'X' })).toMatchObject({ ok: false, error: expect.stringContaining('No Salesforce source files') });
    expect(readSalesforceSource(files, {})).toMatchObject({ ok: false, error: expect.stringContaining('Give `component` or `path`') });
    expect(readSalesforceSource(files, { component: 'Nope' })).toMatchObject({ ok: false, error: expect.stringContaining('No source file matches component "Nope"') });
    const twins = [file('a/classes/Dup.cls', 'one'), file('b/classes/Dup.cls', 'two')];
    expect(readSalesforceSource(twins, { path: 'Dup.cls' })).toMatchObject({ ok: false, error: expect.stringContaining('2 files match') });
  });
});
