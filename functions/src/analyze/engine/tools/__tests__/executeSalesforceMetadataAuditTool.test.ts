import JSZip from 'jszip';

import { executeSalesforceMetadataAuditTool, formatRisksByRule, matchingRisks } from '../executeSalesforceMetadataAuditTool';
import type { SalesforceMetadataRisk } from '../../../salesforce/SalesforceMetadataService';

// The sandbox filesystem is injected on the server (the browser mocked the sandboxService singleton).
const mockSandboxService = {
  listFiles: jest.fn(),
  readFile: jest.fn(),
  mountFile: jest.fn(),
  writeFile: jest.fn(),
  linkFiles: jest.fn(),
  extractZips: jest.fn(),
};

// What the tool left in the sandbox: written files plus the paths linked to them.
const sandboxFiles = new Map<string, string>();

function writtenFile(path: string): string | undefined {
  return sandboxFiles.get(path);
}

describe('executeSalesforceMetadataAuditTool', () => {
  beforeEach(() => {
    mockSandboxService.listFiles.mockReset();
    mockSandboxService.readFile.mockReset();
    mockSandboxService.mountFile.mockReset();
    mockSandboxService.mountFile.mockImplementation(async (_filename: string, _data: ArrayBuffer, path: string) => path);
    sandboxFiles.clear();
    mockSandboxService.writeFile.mockReset();
    mockSandboxService.writeFile.mockImplementation(async (path: string, bytes: Uint8Array) => {
      sandboxFiles.set(path, Buffer.from(bytes).toString('utf8'));
    });
    mockSandboxService.extractZips.mockReset();
    mockSandboxService.extractZips.mockResolvedValue(undefined);
    mockSandboxService.linkFiles.mockReset();
    mockSandboxService.linkFiles.mockImplementation(async (groups: Array<{ target: string; links: string[] }>) => {
      for (const { target, links } of groups) {
        for (const link of links) sandboxFiles.set(link, sandboxFiles.get(target) ?? '');
      }
    });
  });

  describe('the whole workspace', () => {
    async function qaBundle(): Promise<ArrayBuffer> {
      const zip = new JSZip();
      zip.file('qa/sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }], namespace: '' }));
      zip.file('qa/force-app/main/default/classes/TourService.cls', 'public with sharing class TourService {}');
      zip.file('qa/force-app/main/default/classes/TourService.cls-meta.xml', '<ApexClass><apiVersion>64.0</apiVersion><status>Active</status></ApexClass>');
      zip.file('qa/force-app/main/default/roles/Center_Director.role-meta.xml', '<Role><name>Center Director</name></Role>');
      zip.file('qa/force-app/main/default/objects/Lead/recordTypes/Center.recordType-meta.xml', '<RecordType><fullName>Center</fullName></RecordType>');
      zip.file('qa/force-app/main/default/objects/Lead/listViews/hed__All.listView-meta.xml', '<ListView />');
      zip.file('qa/force-app/main/default/objectTranslations/Lead-es/Lead-es.objectTranslation-meta.xml', '<CustomObjectTranslation />');
      zip.file('qa/force-app/main/default/email/Tours/Welcome.email-meta.xml', '<EmailTemplate><attachments><content>JVBERi0xLjQNJeLjz9MNCjMx</content><name>a.pdf</name></attachments></EmailTemplate>');
      zip.file('qa/.symposium/salesforce-runs/latest.json', JSON.stringify({
        version: 1,
        kind: 'salesforce_retrieve_run',
        runId: '2026-10-15T18-16-43Z',
        createdAt: '2026-10-15T18:27:40Z',
        finishedAt: '2026-10-15T18:27:40Z',
        status: 'success',
        org: { alias: 'QA', orgId: '00D5g000000AbCdEAA', apiVersion: '68.0' },
        sourceApiVersion: '64.0',
        components: { retrieved: 72783, failed: 60, failedProject: 60, failedManaged: 0 },
        writer: { name: 'pull-metadata' },
        runRoot: '/Users/someone/Developer/qa/.symposium/salesforce-runs/run',
      }));
      return zip.generateAsync({ type: 'arraybuffer' });
    }

    it('indexes every package file, says which pull it is, and unpacks it for Python', async () => {
      mockSandboxService.readFile.mockResolvedValue(await qaBundle());
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-ws', {
        operation: 'inventory',
        paths: ['/uploads/qa-salesforce-metadata.zip'],
      });

      expect(result.success).toBe(true);
      expect(mockSandboxService.extractZips).toHaveBeenCalledWith(['/uploads/qa-salesforce-metadata.zip'], '/data/salesforce/workspace');
      expect(result.content).toContain('Snapshot: QA (00D5g000000AbCdEAA), pulled 2026-10-15T18:27:40Z, pull success; 72783 components retrieved, 60 failed (60 project-owned); org API 68.0, source API 64.0.');
      expect(result.content).toContain('unpacked at /data/salesforce/workspace/');
      expect(result.content).toContain('Other metadata: 4 (3 project-owned); by folder: email 1, listViews 1, recordTypes 1, roles 1');
      // The counts are the inventory; search finds a component (no preview of the first 40, as in the live tests).
      expect(result.content).not.toContain('Component inventory preview');
      expect(result.content).not.toContain('- Lead.Center (recordTypes)');
      expect(result.content).not.toContain('/Users/someone');
      expect(result.content).not.toContain('objectTranslation');

      const summary = JSON.parse(result.metadata!.fullStdout as string).sourceSummary;
      expect(summary.retrieveRun).toMatchObject({ runId: '2026-10-15T18-16-43Z', org: { alias: 'QA' } });
      expect(summary.retrieveRun.runRoot).toBeUndefined();
      expect(summary.metadataTypes).toEqual({ email: 1, listViews: 1, recordTypes: 1, roles: 1 });
      // A package's list view on the org's object is inventory; the org's record type is its own.
      expect(summary.managedComponentCount).toBe(1);
    });

    it('unpacks packets imported on their own with the source, as the uploads restore does', async () => {
      const packets = new JSZip();
      packets.file('qa/.symposium/salesforce-insights/20261016T182500Z-limits/limits.csv', 'limit,max,remaining,at\nDataStorageMB,486640,293200,2026-10-16T18:25:00Z');
      const packetZip = await packets.generateAsync({ type: 'arraybuffer' });
      const bundle = await qaBundle();
      mockSandboxService.readFile.mockImplementation(async (path: string) => (path.endsWith('insights.zip') ? packetZip : bundle));
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-ws', {
        operation: 'inventory',
        paths: ['/uploads/qa-salesforce-metadata.zip', '/uploads/qa-salesforce-insights.zip'],
      });

      expect(result.success).toBe(true);
      expect(mockSandboxService.extractZips).toHaveBeenCalledWith(['/uploads/qa-salesforce-insights.zip', '/uploads/qa-salesforce-metadata.zip'], '/data/salesforce/workspace');
    });

    it('still audits when the workspace cannot be unpacked, and says so', async () => {
      mockSandboxService.readFile.mockResolvedValue(await qaBundle());
      mockSandboxService.extractZips.mockRejectedValue(new Error('sandbox busy'));
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-ws-fail', {
        operation: 'inventory',
        paths: ['/uploads/qa-salesforce-metadata.zip'],
      });
      expect(result.success).toBe(true);
      expect(result.content).toContain('could not be unpacked at /data/salesforce/workspace/ (sandbox busy)');
    });
  });

  describe('operation=flow_diagram', () => {
    const flowXml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Flow>${body}</Flow>`;

    it('writes each Flow as a diagram file in the user\'s Outputs when the model delivers it, and returns it for capture', async () => {
      const zip = new JSZip();
      zip.file('force-app/main/default/flows/Set_Source.flow-meta.xml', flowXml('<label>Set source</label><processType>AutoLaunchedFlow</processType><start><connector><targetReference>Set</targetReference></connector><object>Lead</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordAfterSave</triggerType></start><recordUpdates><name>Set</name><label>Set the source</label><inputReference>$Record</inputReference></recordUpdates>'));
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-flow', {
        operation: 'flow_diagram',
        paths: ['/uploads/qa.zip'],
        flows: ['Set_Source', 'Missing_Flow'],
        deliver: true,
      });

      expect(result.success).toBe(true);
      expect(result.dataOutputs?.map((output) => output.filename)).toEqual(['flow_set_source.diagram.json']);
      const written = JSON.parse(writtenFile('/output/flow_set_source.diagram.json')!);
      expect(written).toMatchObject({ kind: 'process_flow', platform: 'salesforce', title: 'Flow: Set source' });
      expect(result.content).toContain('Saved to the user\'s Outputs: /output/flow_set_source.diagram.json.');
      expect(result.content).toContain('Flow: Set_Source, 3 nodes and 2 flows. 1 element has no fault path (each carries an issue).');
      expect(result.content).toContain('No Flow file for: Missing_Flow.');
    });

    it('keeps a Flow it drew to look at the org out of the user\'s Outputs: a working file, not captured', async () => {
      const zip = new JSZip();
      zip.file('force-app/main/default/flows/Set_Source.flow-meta.xml', flowXml('<label>Set source</label><processType>AutoLaunchedFlow</processType><start><connector><targetReference>Set</targetReference></connector><object>Lead</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordAfterSave</triggerType></start><recordUpdates><name>Set</name><label>Set the source</label><inputReference>$Record</inputReference></recordUpdates>'));
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-flow-look', { operation: 'flow_diagram', paths: ['/uploads/qa.zip'], flows: ['Set_Source'] });

      expect(result.success).toBe(true);
      expect(result.dataOutputs).toBeUndefined();
      expect(writtenFile('/output/flow_set_source.diagram.json')).toBeUndefined();
      expect(JSON.parse(writtenFile('/data/salesforce/diagrams/flow_set_source.diagram.json')!)).toMatchObject({ kind: 'process_flow' });
      expect(result.content).toContain('Working file (not in the user\'s Outputs): /data/salesforce/diagrams/flow_set_source.diagram.json.');
    });

    it('asks for flows, and says what a Flow needs when none is found', async () => {
      mockSandboxService.readFile.mockResolvedValue(new TextEncoder().encode('public class A {}').buffer);
      const none = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-flow-none', { operation: 'flow_diagram', paths: ['/uploads/force-app/main/default/classes/A.cls'], flows: [] });
      expect(none).toMatchObject({ success: false, error: expect.stringContaining('operation=flow_diagram needs flows') });
      const missing = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-flow-missing', { operation: 'flow_diagram', paths: ['/uploads/force-app/main/default/classes/A.cls'], flows: ['Nope'] });
      expect(missing).toMatchObject({ success: false, error: expect.stringContaining('No Flow file was found for Nope') });
    });
  });

  describe('operation=flows', () => {
    it('writes one row per Flow the org owns as working files, and sums them up', async () => {
      const zip = new JSZip();
      zip.file('qa/force-app/main/default/flows/Set_Source.flow-meta.xml', '<Flow><label>Set source</label><processType>AutoLaunchedFlow</processType><status>Active</status><triggerOrder>100</triggerOrder><start><connector><targetReference>Set</targetReference></connector><object>Lead</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordAfterSave</triggerType></start><recordUpdates><name>Set</name><label>Set the source</label><inputReference>$Record</inputReference></recordUpdates></Flow>');
      zip.file('qa/force-app/main/default/flows/hed__Package_Flow.flow-meta.xml', '<Flow><label>Package</label><processType>AutoLaunchedFlow</processType><status>Active</status></Flow>');
      zip.file('qa/.symposium/salesforce-runs/latest.json', JSON.stringify({ version: 1, kind: 'salesforce_retrieve_run', runId: 'pull-1', createdAt: '2026-10-15T18:27:40Z', org: { alias: 'QA', orgId: '00Dca000005CnrhEAC' } }));
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-flows', { operation: 'flows', paths: ['/uploads/qa.zip'] });

      expect(result.success).toBe(true);
      // Working files: kept out of the user's Outputs.
      expect(result.dataOutputs).toBeUndefined();
      const csv = writtenFile('/output/salesforce/salesforce-flows.csv')!;
      expect(writtenFile('/data/salesforce/salesforce-flows.csv')).toBe(csv);
      expect(csv.split('\n')[1]).toMatch(/^Set_Source,Set source,Active,AutoLaunchedFlow,RecordAfterSave,Lead,Create,100,/);
      expect(JSON.parse(writtenFile('/data/salesforce/salesforce-flows.json')!)).toEqual([expect.objectContaining({ name: 'Set_Source', updatesOwnRecord: true })]);
      expect(result.content).toContain('Snapshot: QA (00Dca000005CnrhEAC)');
      expect(result.content).toContain('Flows the org owns: 1, 1 active.');
      expect(result.content).toContain('- Lead: after-save 1');
      expect(result.content).toContain('The table, one row per Flow: /data/salesforce/salesforce-flows.csv');
      expect(result.content).toContain('Columns: name, label, status, processType, triggerType, object, recordTriggerType, triggerOrder, entryCriteria,');
      expect(result.content).toContain('unpacked at /data/salesforce/workspace/');
    });

    it('starts with the workspace: its snapshot, and the evidence packets it carries and where their findings are', async () => {
      // The Flow redesign live test (2026-10-22): a run that began with operation="flows" never learned
      // the upload carried a packet, and read its evidence file a slice at a time.
      const zip = new JSZip();
      zip.file('qa/force-app/main/default/flows/Set_Source.flow-meta.xml', '<Flow><label>Set source</label><processType>AutoLaunchedFlow</processType><status>Active</status></Flow>');
      zip.file('qa/.symposium/salesforce-runs/latest.json', JSON.stringify({ version: 1, kind: 'salesforce_retrieve_run', runId: 'pull-1', createdAt: '2026-10-15T18:27:40Z', org: { alias: 'QA', orgId: '00Dca000005CnrhEAC' } }));
      const packet = 'qa/.symposium/salesforce-insights/20261022T002800Z-flow-runtime';
      zip.file(`${packet}/manifest.json`, JSON.stringify({
        version: 1, kind: 'salesforce_insight_packet', createdAt: '2026-10-22T00:28:00Z',
        source: { workspaceName: 'QA', gitBranch: '', gitCommit: null },
        agentSession: { agent: 'claude_code', toolsUsed: ['salesforce_mcp'] },
        goals: ['Flow runtime'],
        files: { findings: 'findings.json', evidence: 'evidence.md' },
      }));
      const finding = (id: string, title: string) => ({
        id, title, severity: 'high', audienceImpact: 'engineering', summary: `${title}.`, affectedPaths: [],
        affectedComponents: ['Set_Source'], evidenceRefs: [`evidence.md#${id}`], recommendedNextStep: 'Check it.', confidence: 0.9,
      });
      zip.file(`${packet}/findings.json`, JSON.stringify({ findings: [finding('f1', 'Trigger order set'), finding('f2', 'SOQL limit failures')] }));
      zip.file(`${packet}/evidence.md`, '# Evidence');
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-flows-packet', { operation: 'flows', paths: ['/uploads/qa.zip'] });

      expect(result.content!.split('\n').slice(0, 3)).toEqual([
        expect.stringMatching(/^Snapshot: QA \(00Dca000005CnrhEAC\)/),
        'Imported agent evidence: 2 findings across 1 packet; operation="packet_findings" lists them.',
        '',
      ]);
    });

    it('says what a Flow is when the upload has none', async () => {
      mockSandboxService.readFile.mockResolvedValue(new TextEncoder().encode('public class A {}').buffer);
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-flows-none', { operation: 'flows', paths: ['/uploads/force-app/main/default/classes/A.cls'] });
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('No Flow files the org owns were found') });
    });
  });

  describe('operation=save_order', () => {
    it('writes each object\'s save order as a diagram file and says what it left out', async () => {
      const zip = new JSZip();
      zip.file('force-app/main/default/objects/Lead/Lead.object-meta.xml', '<CustomObject/>');
      zip.file('force-app/main/default/flows/Set_Source.flow-meta.xml', '<Flow><label>Set source</label><status>Active</status><start><object>Lead</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordBeforeSave</triggerType></start></Flow>');
      zip.file('force-app/main/default/triggers/hed__TDTM_Lead.trigger', '(hidden)');
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-save', { operation: 'save_order', paths: ['/uploads/qa.zip'], objects: ['Lead', 'Nope__c'], deliver: true });

      expect(result.success).toBe(true);
      expect(result.dataOutputs?.map((output) => output.filename)).toEqual(['save_order_lead.diagram.json']);
      expect(JSON.parse(writtenFile('/output/save_order_lead.diagram.json')!)).toMatchObject({ kind: 'process_flow', platform: 'salesforce', title: 'What runs when a Lead saves' });
      expect(result.content).toContain('Saved to the user\'s Outputs: /output/save_order_lead.diagram.json.');
      expect(result.content).toContain('Save order for Lead: 1 piece of automation');
      expect(result.content).toContain('these names mention Lead: hed__TDTM_Lead. They may also run on its saves');
      expect(result.content).toContain('No metadata for: Nope__c.');

      // Drawn to look at the org (no deliver): a working file, not captured.
      sandboxFiles.clear();
      const look = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-save-look', { operation: 'save_order', paths: ['/uploads/qa.zip'], objects: ['Lead'] });
      expect(look.dataOutputs).toBeUndefined();
      expect(writtenFile('/output/save_order_lead.diagram.json')).toBeUndefined();
      expect(writtenFile('/data/salesforce/diagrams/save_order_lead.diagram.json')).toBeDefined();
      expect(look.content).toContain('Working file (not in the user\'s Outputs): /data/salesforce/diagrams/save_order_lead.diagram.json.');
    });

    it('asks for objects', async () => {
      mockSandboxService.readFile.mockResolvedValue(new TextEncoder().encode('public class A {}').buffer);
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-save-none', { operation: 'save_order', paths: ['/uploads/force-app/main/default/classes/A.cls'], objects: [] });
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('operation=save_order needs objects') });
    });
  });

  describe('operation=data_model', () => {
    const fieldXml = (name: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?><CustomField><fullName>${name}</fullName>${body}</CustomField>`;

    it('writes the objects as a diagram file in the user\'s Outputs when the model delivers it, and returns it for capture', async () => {
      const zip = new JSZip();
      zip.file('force-app/main/default/objects/Center__c/Center__c.object-meta.xml', '<CustomObject><label>Center</label><nameField><label>Center Name</label><type>Text</type></nameField></CustomObject>');
      zip.file('force-app/main/default/objects/Enrollment__c/Enrollment__c.object-meta.xml', '<CustomObject><label>Enrollment</label></CustomObject>');
      zip.file('force-app/main/default/objects/Enrollment__c/fields/Center__c.field-meta.xml', fieldXml('Center__c', '<label>Center</label><type>MasterDetail</type><referenceTo>Center__c</referenceTo>'));
      zip.file('force-app/main/default/objects/Enrollment__c/fields/Contact__c.field-meta.xml', fieldXml('Contact__c', '<label>Contact</label><type>Lookup</type><referenceTo>Contact</referenceTo>'));
      zip.file('force-app/main/default/permissionsets/Center_Manager.permissionset-meta.xml', '<PermissionSet><label>Center Manager</label><fieldPermissions><editable>true</editable><field>Enrollment__c.Center__c</field><readable>true</readable></fieldPermissions><objectPermissions><allowCreate>false</allowCreate><allowDelete>false</allowDelete><allowEdit>true</allowEdit><allowRead>true</allowRead><modifyAllRecords>false</modifyAllRecords><object>Enrollment__c</object><viewAllRecords>false</viewAllRecords></objectPermissions></PermissionSet>');
      zip.file('force-app/main/default/permissionsetgroups/Managers.permissionsetgroup-meta.xml', '<PermissionSetGroup><label>Managers</label><permissionSets>Center_Manager</permissionSets></PermissionSetGroup>');
      zip.file('force-app/main/default/flows/Enroll.flow-meta.xml', '<Flow><subflows><name>Run_Child</name><flowName>Enroll_Child</flowName></subflows></Flow>');
      zip.file('force-app/main/default/flows/Enroll_Child.flow-meta.xml', '<Flow><label>Enroll child</label></Flow>');
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-dm', {
        operation: 'data_model',
        paths: ['/uploads/salesforce-metadata-kc.zip'],
        name: 'Enrollment Model.diagram.json',
        deliver: true,
      });

      expect(result.success).toBe(true);
      expect(result.dataOutputs?.map((output) => output.filename)).toEqual(['enrollment_model.diagram.json', 'enrollment_model.references.json', 'enrollment_model.access.json']);
      const references = JSON.parse(writtenFile('/output/enrollment_model.references.json')!);
      expect(references).toMatchObject({ version: 1, kind: 'salesforce_references', diagram: 'enrollment_model.diagram.json' });
      expect(Object.keys(references.objects)).toEqual(['Center__c', 'Enrollment__c', 'Contact']);
      // Enrollment__c.Center__c looks up to Center__c: a reference to the object.
      expect(references.objects.Center__c.references).toEqual([expect.objectContaining({ kind: 'relationship', component: 'Enrollment__c.Center__c', how: 'looks up to it' })]);
      expect(result.content).toContain('What refers to each object and field');
      // The calls between components, for a change's reach past the direct references.
      expect(references.calls).toEqual([expect.objectContaining({ from: 'flow:Enroll', to: 'flow:Enroll_Child', how: 'subflow' })]);
      // Who can read or edit each drawn object and every field on it.
      const access = JSON.parse(writtenFile('/output/enrollment_model.access.json')!);
      expect(access).toMatchObject({ version: 1, kind: 'salesforce_access', diagram: 'enrollment_model.diagram.json' });
      expect(access.holders).toEqual([
        expect.objectContaining({ kind: 'permissionSet', name: 'Center_Manager', label: 'Center Manager' }),
        expect.objectContaining({ kind: 'permissionSetGroup', name: 'Managers', permissionSets: [0] }),
      ]);
      expect(access.objects.Enrollment__c.grants).toEqual([{ holder: 0, read: true, create: false, edit: true, delete: false, viewAll: false, modifyAll: false }]);
      expect(access.objects.Enrollment__c.fields.Center__c).toEqual({ read: [0], edit: [0] });
      expect(result.content).toContain('Who can read or edit each object and every field on it, drawn or not');
      expect(result.content).toContain('Each object and field names its source file: a standard field without one isn\'t drawn.');
      expect(result.content).not.toContain('Activity\'s custom fields');
      const written = JSON.parse(writtenFile('/output/enrollment_model.diagram.json')!);
      expect(written).toMatchObject({ kind: 'data_model', platform: 'salesforce', summary: '2 objects with their fields and relationships, read from salesforce-metadata-kc.zip.' });
      expect(written.entities.map((entity: { id: string }) => entity.id)).toEqual(['Center__c', 'Enrollment__c', 'Contact']);
      expect(written.relationships).toHaveLength(2);
      expect(Buffer.from(result.dataOutputs![0].base64, 'base64').toString('utf8')).toBe(writtenFile('/output/enrollment_model.diagram.json'));
      expect(result.content).toContain('Data model from the uploaded metadata: 2 objects with their fields (Center__c, Enrollment__c) and 2 relationships.');
      expect(result.content).toContain('Saved to the user\'s Outputs: /output/enrollment_model.diagram.json.');
      expect(result.content).toContain('Added without fields, because a field points at them: Contact (naming them in objects adds their fields).');
      expect(result.content).toContain('is in /output/enrollment_model.references.json');
      // Nothing of the audit bundle.
      expect(writtenFile('/output/salesforce/artifact-manifest.json')).toBeUndefined();
    });

    it('reads an empty objects list as no list, as a model that fills every parameter sends it', async () => {
      const zip = new JSZip();
      zip.file('force-app/main/default/objects/Center__c/Center__c.object-meta.xml', '<CustomObject><label>Center</label></CustomObject>');
      zip.file('force-app/main/default/objects/Center__c/fields/Code__c.field-meta.xml', fieldXml('Code__c', '<type>Text</type><length>10</length>'));
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      // The arguments GPT sent in the live run that drew nothing.
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-dm-empty', {
        operation: 'data_model', objects: [], flows: [], chain: false, name: 'org_data_model',
        paths: ['/uploads/QA-salesforce-metadata.zip'], query: '', component: '', include_artifacts: true,
      });

      expect(result.success).toBe(true);
      expect(JSON.parse(writtenFile('/data/salesforce/diagrams/org_data_model.diagram.json')!).entities.map((entity: { id: string }) => entity.id)).toEqual(['Center__c']);
      expect(result.content).toContain('Without a list of objects it draws the org\'s own');
      // Not delivered: a working file with its references and access files beside it, none captured.
      expect(result.dataOutputs).toBeUndefined();
      expect(writtenFile('/data/salesforce/diagrams/org_data_model.references.json')).toBeDefined();
      expect(writtenFile('/data/salesforce/diagrams/org_data_model.access.json')).toBeDefined();
      expect(result.content).toContain('Working file (not in the user\'s Outputs): /data/salesforce/diagrams/org_data_model.diagram.json.');
      expect(result.content).toContain('is in /data/salesforce/diagrams/org_data_model.references.json');
    });

    it('reads a metadata-format .object upload and says which objects it could not find', async () => {
      mockSandboxService.readFile.mockResolvedValue(new TextEncoder().encode(
        '<CustomObject><label>Invoice</label><fields><fullName>Amount__c</fullName><type>Currency</type><precision>16</precision><scale>2</scale></fields></CustomObject>',
      ).buffer);
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-dm-legacy', {
        operation: 'data_model',
        paths: ['/uploads/unpackaged/objects/Invoice__c.object'],
        objects: ['Invoice__c', 'Payment__c'],
        deliver: true,
      });
      expect(result.success).toBe(true);
      expect(result.dataOutputs?.[0].filename).toBe('salesforce_data_model.diagram.json');
      expect(result.content).toContain('Not in the upload: Payment__c.');
      expect(JSON.parse(writtenFile('/output/salesforce_data_model.diagram.json')!).entities[0].fields).toEqual([
        { name: 'Amount__c', type: 'Currency(16,2)' },
      ]);
    });

    it('fails with what a data model needs when the upload has no object metadata', async () => {
      mockSandboxService.readFile.mockResolvedValue(new TextEncoder().encode('public class A {}').buffer);
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-dm-none', {
        operation: 'data_model',
        paths: ['/uploads/force-app/main/default/classes/A.cls'],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('a data model needs objects/<Object>/fields/<Field>.field-meta.xml');
    });
  });

  it('writes generated Salesforce artifacts to deterministic filesystem paths for follow-up Python analysis', async () => {
    const manifest = {
      version: 1,
      kind: 'salesforce_insight_packet',
      createdAt: '2026-05-07T19:01:45Z',
      source: {
        workspaceName: 'Salesforce/QA',
        gitBranch: 'main',
        gitCommit: null,
      },
      agentSession: {
        agent: 'claude_code',
        toolsUsed: ['salesforce_mcp', 'static_analysis'],
      },
      goals: ['Render stakeholder findings'],
      files: {
        findings: 'findings.json',
        evidence: 'evidence.md',
        transcript: 'transcript.md',
      },
    };
    const findings = {
      findings: [
        {
          id: 'sf-token-risk',
          title: 'Token field is not constrained',
          severity: 'medium',
          audienceImpact: 'security',
          summary: 'The public token lookup has no unique or external-id constraint.',
          affectedPaths: ['force-app/main/default/classes/CaseService.cls'],
          affectedComponents: ['CaseService'],
          evidenceRefs: ['evidence.md#sf-token-risk'],
          recommendedNextStep: 'Review the token lookup path before implementation.',
          confidence: 0.8,
        },
      ],
    };
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/manifest.json', JSON.stringify(manifest));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/findings.json', JSON.stringify(findings));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/evidence.md', '# Evidence\n<a id="sf-token-risk"></a>');
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/transcript.md', 'Transcript');

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-1', {
      operation: 'audit',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Static metadata signals requiring docs/AI review:');
    expect(result.content).toContain('Salesforce documentation lookup topics generated:');
    expect(result.content).toContain('Imported agent evidence from .symposium packets: 1');
    expect(result.content).toContain('top-level `importedFindings` key');
    expect(result.content).toMatch(/The audit's \d+ working files are listed below; each is also at \/data\/salesforce\/<name> and \/output\/salesforce\/<name>\./);
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual(
      expect.arrayContaining([
        'artifact-manifest.json',
        'salesforce-component-index.json',
        'salesforce-insight-packets.json',
        'salesforce-workbench-summary.json',
        'salesforce-signal-evidence.json',
        'salesforce-doc-topics.json',
        'salesforce-artifact-schema.json',
        'salesforce-stakeholder-visual-artifacts.json',
      ])
    );

    expect(writtenFile('/output/salesforce/salesforce-insight-packets.json')).toBeDefined();
    expect(writtenFile('/data/salesforce/salesforce-insight-packets.json')).toBeDefined();
    expect(writtenFile('/data/salesforce_insight_packet_summary.json')).toBeDefined();
    expect(writtenFile('/data/salesforce_artifact_schema.json')).toBeDefined();
    expect(writtenFile('/data/salesforce_doc_topics.json')).toBeDefined();
    expect(writtenFile('/data/salesforce_signal_evidence.json')).toBeDefined();
    expect(writtenFile('/data/salesforce_workbench_summary.json')).toBeDefined();

    const insightPacketWrite = writtenFile('/output/salesforce/salesforce-insight-packets.json');
    expect(insightPacketWrite).toBeDefined();
    expect(JSON.parse(insightPacketWrite!)).toMatchObject({
      schema: {
        keyPaths: {
          importedFindings: 'importedFindings[]',
          matchedComponents: 'importedFindings[].matchedComponents[]',
        },
      },
      importedFindings: [
        expect.objectContaining({
          id: 'sf-token-risk',
          matchedComponents: [
            expect.objectContaining({ name: 'CaseService' }),
          ],
        }),
      ],
    });

    // Each output is written once; its other paths are links, in one sandbox call.
    const writtenPaths = mockSandboxService.writeFile.mock.calls.map((call) => call[0]);
    expect(writtenPaths.every((path) => path.startsWith('/output/salesforce/'))).toBe(true);
    expect(new Set(writtenPaths).size).toBe(writtenPaths.length);
    expect(mockSandboxService.linkFiles).toHaveBeenCalledTimes(1);
    expect(writtenFile('/data/salesforce/salesforce-insight-packets.json')).toBe(writtenFile('/output/salesforce/salesforce-insight-packets.json'));
    expect(writtenFile('/output/salesforce/salesforce-insight-packets.json')).not.toMatch(/\n {2}"/);

    const manifestWrite = writtenFile('/output/salesforce/artifact-manifest.json');
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite!)).toMatchObject({
      outputRoot: '/output/salesforce',
      dataRoot: '/data/salesforce',
      files: expect.arrayContaining([
        expect.objectContaining({
          filename: 'salesforce-insight-packets.json',
          outputPath: '/output/salesforce/salesforce-insight-packets.json',
          dataPath: '/data/salesforce/salesforce-insight-packets.json',
          aliases: ['/output/salesforce-insight-packets.json', '/data/salesforce_insight_packet_summary.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-artifact-schema.json',
          outputPath: '/output/salesforce/salesforce-artifact-schema.json',
          dataPath: '/data/salesforce/salesforce-artifact-schema.json',
          aliases: ['/output/salesforce-artifact-schema.json', '/data/salesforce_artifact_schema.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-doc-topics.json',
          outputPath: '/output/salesforce/salesforce-doc-topics.json',
          dataPath: '/data/salesforce/salesforce-doc-topics.json',
          aliases: ['/output/salesforce-doc-topics.json', '/data/salesforce_doc_topics.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-signal-evidence.json',
          outputPath: '/output/salesforce/salesforce-signal-evidence.json',
          dataPath: '/data/salesforce/salesforce-signal-evidence.json',
          aliases: ['/output/salesforce-signal-evidence.json', '/data/salesforce_signal_evidence.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-workbench-summary.json',
          outputPath: '/output/salesforce/salesforce-workbench-summary.json',
          dataPath: '/data/salesforce/salesforce-workbench-summary.json',
          aliases: ['/output/salesforce-workbench-summary.json', '/data/salesforce_workbench_summary.json'],
        }),
      ]),
    });
  });

  it('names the org a version 3 packet queried, and flags production evidence for a sandbox workspace', async () => {
    const manifest = {
      version: 3,
      kind: 'salesforce_insight_packet',
      createdAt: '2026-10-17T14:30:00Z',
      source: { workspaceName: 'qa', gitBranch: 'main', gitCommit: null },
      agentSession: { agent: 'claude_code', toolsUsed: ['sf_cli'] },
      goals: ['Lead conversion latency'],
      orgs: [
        { alias: 'QA', orgId: '00Dca000005CnrhEAC', sandbox: true },
        { alias: 'Prod', orgId: '00DA0000000IMJcMAO', sandbox: false },
      ],
      files: { findings: 'findings.json', evidence: 'evidence.md' },
    };
    const findings = {
      findings: [{
        id: 'f1-latency',
        title: 'Leads convert in about 3 seconds',
        severity: 'low',
        audienceImpact: 'product',
        summary: 'Median create-to-convert latency was 3 s.',
        affectedPaths: ['force-app/main/default/classes/CaseService.cls'],
        affectedComponents: ['CaseService'],
        evidenceRefs: ['evidence.md#f1-latency'],
        runtimeQueries: [
          { id: 'q1', org: 'Prod', query: 'SELECT COUNT() FROM Lead WHERE IsConverted = true' },
          { id: 'q2', org: 'QA', query: 'SELECT COUNT() FROM FlowDefinitionView' },
        ],
        recommendedNextStep: 'None.',
        confidence: 0.9,
      }],
    };
    const zip = new JSZip();
    zip.file('qa/sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('qa/force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('qa/.symposium/salesforce-runs/latest.json', JSON.stringify({ version: 1, kind: 'salesforce_retrieve_run', runId: 'pull-1', createdAt: '2026-10-15T18:27:40Z', org: { alias: 'QA', orgId: '00Dca000005CnrhEAC' } }));
    zip.file('qa/.symposium/salesforce-insights/20261017T143000Z-latency/manifest.json', JSON.stringify(manifest));
    zip.file('qa/.symposium/salesforce-insights/20261017T143000Z-latency/findings.json', JSON.stringify(findings));
    zip.file('qa/.symposium/salesforce-insights/20261017T143000Z-latency/evidence.md', '## f1-latency\n\nThree seconds.');
    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-orgs', {
      operation: 'packet_findings',
      paths: ['/uploads/qa-salesforce-metadata.zip'],
    });

    // Each query by id, org and what it returned; the SOQL and rows stay in the packet file.
    expect(result.content).toContain('  Queries: q1 (Prod); q2 (QA)');
    expect(result.content).not.toContain('SELECT COUNT() FROM Lead');
    expect(result.content).toContain('- 20261017T143000Z-latency: Queried QA (sandbox), Prod (production). Prod is production; the workspace\'s metadata came from QA.');
    const summary = JSON.parse(writtenFile('/output/salesforce/salesforce-insight-packets.json')!);
    expect(summary.validPackets[0]).toMatchObject({ queriedOrgs: ['Prod', 'QA'], productionEvidence: true });
    expect(summary.importedFindings[0].runtimeQueries[0]).toMatchObject({ id: 'q1', org: 'Prod' });
  });

  describe('operation=risks', () => {
    const risk = (overrides: Partial<SalesforceMetadataRisk>): SalesforceMetadataRisk => ({
      id: 'r', componentId: 'c', componentName: 'Lead_Flow', path: 'force-app/main/default/flows/Lead_Flow.flow-meta.xml',
      severity: 'medium', title: 'Active flow lacks visible fault paths', ruleId: 'flow.active-no-fault-path', confidence: 0.64,
      docTopicIds: ['flow-fault-paths'], recommendation: 'Add fault paths for data mutations.',
      ...overrides,
    } as SalesforceMetadataRisk);
    const risks = [
      risk({ componentName: 'Lead_Flow' }),
      risk({ componentName: 'Event_Flow', path: 'force-app/main/default/flows/Event_Flow.flow-meta.xml' }),
      risk({ componentName: 'Lead_Flow' }),
      risk({ componentName: 'TourHelper', path: 'force-app/main/default/classes/TourHelper.cls', severity: 'high', title: 'SOQL query inside loop', ruleId: 'apex.soql-in-loop', confidence: 0.78, docTopicIds: [], recommendation: 'Bulkify.' }),
    ];

    it('matches a query against component, title, rule and path, ignoring case', () => {
      expect(matchingRisks(risks, 'FLOW')).toHaveLength(3);
      expect(matchingRisks(risks, 'soql')).toHaveLength(1);
      expect(matchingRisks(risks, '/classes/')).toHaveLength(1);
      expect(matchingRisks(risks, undefined)).toHaveLength(4);
    });

    it('lists every signal by rule, most severe first, each rule\'s recommendation once', () => {
      expect(formatRisksByRule(risks)).toBe([
        '[HIGH] SOQL query inside loop (rule apex.soql-in-loop; confidence 0.78): 1 signal.',
        '  Recommendation: Bulkify.',
        '  Components: TourHelper',
        '[MEDIUM] Active flow lacks visible fault paths (rule flow.active-no-fault-path; confidence 0.64; docs topics flow-fault-paths): 3 signals.',
        '  Recommendation: Add fault paths for data mutations.',
        '  Components: Event_Flow, Lead_Flow (×2)',
      ].join('\n'));
    });

    it('starts with the snapshot, not the index\'s full summary, and says how many signals match', async () => {
      const zip = new JSZip();
      zip.file('qa/force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
      zip.file('qa/.symposium/salesforce-runs/latest.json', JSON.stringify({ version: 1, kind: 'salesforce_retrieve_run', runId: 'pull-1', createdAt: '2026-10-15T18:27:40Z', org: { alias: 'QA', orgId: '00Dca000005CnrhEAC' } }));
      mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-risks', { operation: 'risks', query: 'flow', paths: ['/uploads/qa.zip'] });

      expect(result.content!.startsWith('Snapshot: QA (00Dca000005CnrhEAC)')).toBe(true);
      expect(result.content).not.toContain('Components indexed:');
      expect(result.content).toMatch(/Static signals requiring docs\/AI review that match "flow" \(component, title, rule or path\): \d+ of \d+/);
    });
  });

  it('supports packet_findings as a direct operation for imported agent evidence', async () => {
    const manifest = {
      version: 1,
      kind: 'salesforce_insight_packet',
      createdAt: '2026-05-07T19:01:45Z',
      source: {
        workspaceName: 'Salesforce/QA',
        gitBranch: '',
        gitCommit: null,
      },
      agentSession: {
        agent: 'claude_code',
        toolsUsed: ['salesforce_mcp', 'static_analysis'],
      },
      goals: ['Render stakeholder findings'],
      files: {
        findings: 'findings.json',
        evidence: 'evidence.md',
      },
    };
    const findings = {
      findings: [
        {
          id: 'sf-token-risk',
          title: 'Token field is not constrained',
          severity: 'medium',
          audienceImpact: 'security',
          summary: 'The public token lookup has no unique or external-id constraint.',
          affectedPaths: ['force-app/main/default/classes/CaseService.cls'],
          affectedComponents: ['CaseService'],
          evidenceRefs: ['evidence.md#sf-token-risk'],
          recommendedNextStep: 'Review the token lookup path before implementation.',
          confidence: 0.8,
        },
      ],
    };
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/manifest.json', JSON.stringify(manifest));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/findings.json', JSON.stringify(findings));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/evidence.md', '# Evidence\n<a id="sf-token-risk"></a>');

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-2', {
      operation: 'packet_findings',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Agent insight packets detected: 1');
    expect(result.content).toContain('Imported agent evidence from .symposium packets: 1');
    expect(result.content).toContain('Invalid insight packets / validation warnings: 0');
    expect(result.content).toContain('- sf-token-risk: Token field is not constrained (medium, security, ');
    expect(result.content).toContain('  Summary: The public token lookup has no unique or external-id constraint.');
    expect(result.content).toContain('  Affected paths force-app/main/default/classes/CaseService.cls');
    // Names the matched components once, in the summary's own words: no list of them twice over.
    expect(result.content).not.toContain('Matched components:');
    expect(result.content).toContain('The agent\'s recommended next step: Review the token lookup path before implementation.');
    expect(result.content).toMatch(/The audit's \d+ working files are listed below; each is also at \/data\/salesforce\/<name> and \/output\/salesforce\/<name>\./);
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual(
      expect.arrayContaining([
        'artifact-manifest.json',
        'salesforce-insight-packets.json',
        'salesforce-doc-topics.json',
        'salesforce-artifact-schema.json',
      ])
    );

    const insightPacketWrite = writtenFile('/output/salesforce/salesforce-insight-packets.json');
    expect(insightPacketWrite).toBeDefined();
    const summary = JSON.parse(insightPacketWrite!);
    expect(summary.validPackets[0].warnings).toEqual(expect.arrayContaining([
      'manifest.source.gitBranch is blank; the branch shows as unknown.',
    ]));
    // Before version 3 a packet doesn't say which org it queried, and the AI is told so.
    expect(summary.validPackets[0]).toMatchObject({ orgs: null, productionEvidence: false });
    expect(result.content).toContain('Which org each packet queried:\n- 20260507T190145Z-qa-source-audit: Which org this packet queried isn\'t recorded');
    expect(summary.importedFindings[0]).toMatchObject({
      id: 'sf-token-risk',
      matchedComponentNames: ['CaseService'],
    });
  });

  it('reports what the audit found and wrote, with no instructions: no org evidence order, no job framing', async () => {
    // Under Auto the model chooses its output from the request (the web's guides);
    // the result reports facts. The org evidence order and the job's synthesis
    // note turned a look at the org into the audit job (the Flow redesign live test).
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    const bundle = await zip.generateAsync({ type: 'arraybuffer' });

    for (const [operation, query] of [['audit', undefined], ['feature_readiness', 'Winter release go-live readiness'], ['troubleshooting', 'System.DmlException at Class.CaseService'], ['risks', undefined], ['handoff', 'Add a fault path']] as const) {
      mockSandboxService.readFile.mockResolvedValue(bundle);
      const result = await executeSalesforceMetadataAuditTool(mockSandboxService, `call-facts-${operation}`, {
        operation,
        paths: ['/uploads/QA-salesforce-metadata.zip'],
        ...(query ? { query } : {}),
      });
      expect(result.success).toBe(true);
      for (const order of ['ORG EVIDENCE', 'MUST', 'Synthesis guidance', 'grounding note', 'Deliverable note', 'before final', 'Org evidence note']) {
        expect(result.content).not.toContain(order);
      }
    }
  });

  it('supports troubleshooting as a direct operation for pasted Flow and Apex errors', async () => {
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', `
public without sharing class CaseService {
  public static void escalate(List<Case> casesToProcess) {
    for (Case c : casesToProcess) {
      update c;
    }
  }
}
`);
    zip.file('force-app/main/default/flows/Case_Escalation.flow-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <status>Active</status>
  <processType>AutoLaunchedFlow</processType>
  <recordUpdates>
    <name>Update_Case</name>
    <object>Case</object>
  </recordUpdates>
</Flow>
`);

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-troubleshooting', {
      operation: 'troubleshooting',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
      query: 'FLOW_ELEMENT_ERROR in Case_Escalation. System.DmlException at Class.CaseService: line 4. End users cannot escalate Cases in production.',
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('# Salesforce Troubleshooting Brief');
    expect(result.content).toContain('CaseService');
    expect(result.content).toContain('Case_Escalation');
    expect(result.content).toContain('Read-Only Diagnostic Path');
    expect(result.content).toMatch(/The audit's \d+ working files are listed below; each is also at \/data\/salesforce\/<name> and \/output\/salesforce\/<name>\./);
    expect(result.dataOutputs?.map((output) => output.filename)).toContain('salesforce-troubleshooting-brief.md');
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual(
      expect.arrayContaining([
        'artifact-manifest.json',
        'salesforce-troubleshooting-brief.md',
        'salesforce-component-index.json',
        'salesforce-dependency-map.json',
        'salesforce-remediation-backlog.json',
        'salesforce-signal-evidence.json',
        'salesforce-workbench-summary.json',
        'salesforce-doc-topics.json',
      ])
    );

    expect(writtenFile('/output/salesforce/salesforce-troubleshooting-brief.md')).toBeDefined();
    expect(writtenFile('/data/salesforce_troubleshooting_brief.md')).toBeDefined();
  });

  it('reports invalid insight packets through packet_findings without manual ZIP parsing', async () => {
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/bad-run/manifest.json', JSON.stringify({
      version: 1,
      kind: 'bad_packet',
      createdAt: '2026-05-07T19:01:45Z',
      source: { workspaceName: 'Salesforce/QA', gitBranch: 'main', gitCommit: null },
      agentSession: { agent: 'claude_code', toolsUsed: ['salesforce_mcp'] },
      goals: ['Render stakeholder findings'],
      files: { findings: 'findings.json', evidence: 'evidence.md' },
    }));
    zip.file('.symposium/salesforce-insights/bad-run/findings.json', JSON.stringify({ findings: [] }));
    zip.file('.symposium/salesforce-insights/bad-run/evidence.md', '# Evidence');

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-3', {
      operation: 'packet_findings',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Agent insight packets detected: 0');
    expect(result.content).toContain('Imported agent evidence from .symposium packets: 0');
    expect(result.content).toContain('Invalid insight packets / validation warnings: 1');

    const insightPacketWrite = writtenFile('/output/salesforce/salesforce-insight-packets.json');
    expect(insightPacketWrite).toBeDefined();
    const summary = JSON.parse(insightPacketWrite!);
    expect(summary.invalidPackets[0]).toMatchObject({
      runId: 'bad-run',
      errors: expect.arrayContaining(['manifest.kind must be salesforce_insight_packet.']),
    });
  });
});
