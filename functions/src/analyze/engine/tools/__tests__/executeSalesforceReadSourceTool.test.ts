import JSZip from 'jszip';

import {
  SOURCE_PAGE_LINES,
  SOURCE_SEARCH_MATCHES,
  executeSalesforceReadSourceTool,
  readSalesforceSource,
} from '../executeSalesforceReadSourceTool';
import type { SandboxFiles } from '../sandboxFiles';
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
    expect(first).toContain(`The file continues: path="classes/Big.cls", start_line=${SOURCE_PAGE_LINES + 1} reads the next lines.`);
    const second = content(readSalesforceSource([long], { path: 'Big.cls', start_line: SOURCE_PAGE_LINES + 1 }));
    expect(second).toContain(`line ${SOURCE_PAGE_LINES + 50}`);
    expect(second).not.toContain('The file continues');
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

describe('executeSalesforceReadSourceTool', () => {
  async function bundle(): Promise<SandboxFiles> {
    const zip = new JSZip();
    zip.file('qa/sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app' }] }));
    zip.file('qa/force-app/main/default/classes/TourService.cls', 'public with sharing class TourService {\n  // Enrolled Family\n}');
    zip.file('qa/force-app/main/default/objects/Lead/recordTypes/Center.recordType-meta.xml', '<RecordType>\n  <label>Enrolled Family Center</label>\n</RecordType>');
    zip.file('qa/force-app/main/default/email/Tours/Welcome.email-meta.xml', '<EmailTemplate><attachments><content>JVBERi0xLjQNJeLjz9MNCjMx</content><name>a.pdf</name></attachments></EmailTemplate>');
    zip.file('qa/force-app/main/default/objectTranslations/Lead-es/Lead-es.objectTranslation-meta.xml', '<label>Enrolled Family</label>');
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    return {
      listFiles: jest.fn().mockResolvedValue([{ name: 'qa-salesforce-metadata.zip', path: '/uploads/qa-salesforce-metadata.zip' }]),
      readFile: jest.fn().mockResolvedValue(bytes),
    } as unknown as SandboxFiles;
  }

  it('reads any metadata in the package directory by path, with email attachments omitted', async () => {
    const files = await bundle();
    const recordType = await executeSalesforceReadSourceTool(files, 'call-rt', { path: 'objects/Lead/recordTypes/Center.recordType-meta.xml' });
    expect(recordType.success).toBe(true);
    expect(recordType.content).toContain('2 |   <label>Enrolled Family Center</label>');

    const email = await executeSalesforceReadSourceTool(files, 'call-email', { component: 'Welcome' });
    expect(email).toMatchObject({ success: true });
    expect(email.content).toContain('<content>[binary attachment omitted]</content>');
  });

  it('searches every package file except object translations', async () => {
    const result = await executeSalesforceReadSourceTool(await bundle(), 'call-search', { pattern: 'Enrolled Family' });
    expect(result.content).toContain('2 matching lines for /Enrolled Family/i in the workspace');
    expect(result.content).not.toContain('objectTranslation');
  });

  it('says when nothing matches a path, without reading the workspace', async () => {
    const result = await executeSalesforceReadSourceTool(await bundle(), 'call-miss', { path: 'classes/Missing.cls' });
    expect(result).toMatchObject({ success: false, error: 'No source file matches path "classes/Missing.cls". Search with `pattern` to find it.' });
  });
});

