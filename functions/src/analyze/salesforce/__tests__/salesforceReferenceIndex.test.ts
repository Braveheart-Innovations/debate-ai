import type { DataModelDiagram } from '../../contract/services/analyze/diagrams/diagramFile';
import type { SalesforceSourceFile } from '../SalesforceMetadataService';
import { buildSalesforceReferenceIndex, soqlFieldUses } from '../salesforceReferenceIndex';

const ZIP = '/uploads/qa.zip';
const D = 'force-app/main/default';

function zipped(path: string, content: string): SalesforceSourceFile {
  return { path: `${D}/${path}`, content, sizeBytes: content.length, sourcePath: ZIP };
}

function model(): DataModelDiagram {
  const src = (path: string) => `${ZIP}#${D}/${path}`;
  return {
    version: 1,
    kind: 'data_model',
    platform: 'salesforce',
    title: 'Leads',
    summary: 'Leads and tours.',
    entities: [
      {
        id: 'Lead', name: 'Lead', source: 'platform',
        fields: [
          { name: 'Status', type: 'Picklist', values: ['Inquiry', 'Toured'], source: src('objects/Lead/fields/Status.field-meta.xml') },
          { name: 'Ready_to_Convert__c', label: 'Ready to Convert', type: 'Checkbox', source: src('objects/Lead/fields/Ready_to_Convert__c.field-meta.xml') },
          { name: 'Center__c', type: 'Lookup', source: src('objects/Lead/fields/Center__c.field-meta.xml') },
        ],
      },
      { id: 'Tour__c', name: 'Tour__c', label: 'Family Tour', source: src('objects/Tour__c/Tour__c.object-meta.xml'), fields: [{ name: 'Center__c', type: 'Lookup' }] },
    ],
    relationships: [],
  };
}

function workspace(): SalesforceSourceFile[] {
  return [
    zipped('objects/Lead/fields/Status.field-meta.xml', '<CustomField><fullName>Status</fullName><type>Picklist</type></CustomField>'),
    zipped('objects/Lead/fields/Ready_to_Convert__c.field-meta.xml', '<CustomField><fullName>Ready_to_Convert__c</fullName><label>Ready to Convert</label></CustomField>'),
    zipped('objects/Lead/fields/Center__c.field-meta.xml', '<CustomField><fullName>Center__c</fullName><type>Lookup</type></CustomField>'),
    zipped('objects/Tour__c/fields/Center__c.field-meta.xml', '<CustomField><fullName>Center__c</fullName><type>Lookup</type></CustomField>'),
    zipped('objects/Tour__c/fields/Lead__c.field-meta.xml', '<CustomField><fullName>Lead__c</fullName><type>Lookup</type><referenceTo>Tour__c</referenceTo></CustomField>'),
    zipped('classes/LeadService.cls', [
      'public class LeadService {',
      '  // Lead.Status in a comment is not a reference',
      '  public static void run() {',
      "    List<Lead> leads = [SELECT Id, Status, Center__c FROM Lead WHERE Ready_to_Convert__c = true AND Status = 'Toured'];",
      '    for (Lead l : leads) { l.Ready_to_Convert__c = false; }',
      '    List<Tour__c> tours = [SELECT Id, (SELECT Status FROM Leads__r) FROM Tour__c WHERE Center__c = :centerId];',
      '  }',
      '}',
    ].join('\n')),
    zipped('triggers/LeadTrigger.trigger', 'trigger LeadTrigger on Lead (before update) {\n  for (Lead l : Trigger.new) { if (l.Ready_to_Convert__c) {} }\n}'),
    zipped('flows/Convert.flow-meta.xml', [
      '<Flow>',
      '  <start><object>Lead</object><filters><field>Ready_to_Convert__c</field></filters></start>',
      '  <recordUpdates><name>Mark</name><inputReference>$Record</inputReference><inputAssignments><field>Status</field><value><stringValue>Toured</stringValue></value></inputAssignments></recordUpdates>',
      '  <recordLookups><name>Tours</name><object>Tour__c</object><filters><field>Center__c</field></filters></recordLookups>',
      '  <formulas><expression>{!$Record.Status}</expression></formulas>',
      '</Flow>',
    ].join('\n')),
    zipped('objects/Lead/validationRules/Need_Center.validationRule-meta.xml', '<ValidationRule><active>true</active><errorConditionFormula>AND(ISPICKVAL(Status, &quot;Toured&quot;), ISBLANK(Center__c))</errorConditionFormula></ValidationRule>'),
    zipped('layouts/Lead-Lead Layout.layout-meta.xml', '<Layout><layoutSections><layoutColumns><layoutItems><field>Status</field></layoutItems><layoutItems><field>Center__c</field></layoutItems></layoutColumns></layoutSections></Layout>'),
    zipped('objects/Lead/listViews/Toured.listView-meta.xml', '<ListView><columns>LEAD.STATUS</columns><columns>Center__c</columns></ListView>'),
    zipped('objects/Lead/recordTypes/Creme.recordType-meta.xml', '<RecordType><picklistValues><picklist>Status</picklist><values><fullName>Toured</fullName></values></picklistValues></RecordType>'),
    zipped('reports/Leads/Toured_Leads.report-meta.xml', '<Report><columns><field>Lead.Ready_to_Convert__c</field></columns></Report>'),
    zipped('email/Tours/Welcome.email', 'Hi {!Lead.FirstName}, your status is {!Lead.Status}. Your Family Tour is booked.'),
    zipped('lwc/tourCard/tourCard.js', "import STATUS from '@salesforce/schema/Lead.Status';"),
    zipped('permissionsets/Tours.permissionset-meta.xml', '<PermissionSet><fieldPermissions><editable>true</editable><field>Lead.Ready_to_Convert__c</field><readable>true</readable></fieldPermissions><objectPermissions><allowEdit>true</allowEdit><allowRead>true</allowRead><object>Lead</object></objectPermissions></PermissionSet>'),
    zipped('profiles/Admin.profile-meta.xml', '<Profile><fieldPermissions><editable>false</editable><field>Lead.Ready_to_Convert__c</field><readable>true</readable></fieldPermissions><layoutAssignments><layout>Tour__c-Family Tour Layout</layout></layoutAssignments></Profile>'),
    zipped('classes/Hidden.cls', '(hidden)'),
  ];
}

describe('the references index', () => {
  it('finds each field\'s references by kind, with file and line, in a file table', () => {
    const index = buildSalesforceReferenceIndex(workspace(), model(), 'leads.diagram.json');
    expect(index).toMatchObject({ version: 1, kind: 'salesforce_references', diagram: 'leads.diagram.json' });
    const where = (object: string, field: string) => index.objects[object].fields[field].references.map((reference) => `${reference.kind}:${reference.component}:${reference.line}${reference.how ? `:${reference.how}` : ''}`);
    expect(where('Lead', 'Status')).toEqual([
      'apex:LeadService:4:SOQL',
      'emailTemplate:Tours/Welcome:1:merge field',
      'flow:Convert:3:sets or filters on it',
      'flow:Convert:5:$Record',
      'layout:Lead-Lead Layout:1',
      'lightningComponent:tourCard:1:schema import',
      'listView:Lead.Toured:1:column or filter',
      'recordType:Lead.Creme:1:picklist values',
      'validationRule:Lead.Need_Center:1:in the condition',
    ]);
    expect(where('Lead', 'Ready_to_Convert__c')).toEqual([
      'apex:LeadService:4:SOQL',
      'apex:LeadService:5:names the field',
      'flow:Convert:2:entry condition',
      'report:Leads/Toured_Leads:1',
      'trigger:LeadTrigger:2:names the field',
    ]);
    // Center__c is on Lead and Tour__c: only the queries and elements on each object count.
    expect(where('Tour__c', 'Center__c')).toEqual(['apex:LeadService:6:SOQL', 'flow:Convert:4:reads or filters on it']);
    expect(where('Lead', 'Center__c')).toEqual(['apex:LeadService:4:SOQL', 'layout:Lead-Lead Layout:1', 'listView:Lead.Toured:1:column or filter', 'validationRule:Lead.Need_Center:1:in the condition']);
    expect(index.files.every((file) => file.startsWith(`${ZIP}#${D}/`))).toBe(true);
    expect(index.files[index.objects.Lead.fields.Status.references[0].file]).toBe(`${ZIP}#${D}/classes/LeadService.cls`);
  });

  it('counts field-level security and lists what a new field on the object would need', () => {
    const index = buildSalesforceReferenceIndex(workspace(), model(), 'leads.diagram.json');
    expect(index.objects.Lead.fields.Ready_to_Convert__c.access).toEqual({ permissionSets: { read: 1, edit: 1 }, profiles: { read: 1, edit: 0 } });
    expect(index.objects.Lead.surface).toEqual({
      layouts: ['Lead-Lead Layout'],
      recordTypes: ['Creme'],
      flexipages: [],
      permissionSets: { read: ['Tours'], edit: ['Tours'] },
      profiles: { read: [], edit: [] },
    });
  });

  it('finds the places that name each picklist value, and labels written as text (not layout names)', () => {
    const index = buildSalesforceReferenceIndex(workspace(), model(), 'leads.diagram.json');
    const toured = index.objects.Lead.fields.Status.valueMentions?.Toured ?? [];
    expect(toured.map((mention) => `${index.files[mention.file].split('/').pop()}:${mention.line}`).sort()).toEqual([
      'Convert.flow-meta.xml:3', 'Creme.recordType-meta.xml:1', 'LeadService.cls:4', 'Need_Center.validationRule-meta.xml:1',
    ]);
    expect(index.objects.Lead.fields.Status.valueMentions?.Inquiry).toBeUndefined();
    expect(index.objects.Tour__c.labelMentions.map((mention) => `${mention.kind}:${mention.component}`)).toEqual(['emailTemplate:Welcome']);
    // A one-word label isn't searched; a multi-word custom field label is.
    expect(index.objects.Lead.fields.Ready_to_Convert__c.labelMentions).toBeUndefined();
  });

  it('records what refers to a custom object, never to a standard one', () => {
    const index = buildSalesforceReferenceIndex(workspace(), model(), 'leads.diagram.json');
    expect(index.objects.Tour__c.references.map((reference) => `${reference.kind}:${reference.component}:${reference.line}:${reference.how}`)).toEqual([
      'apex:LeadService:6:SOQL',
      'flow:Convert:4:gets records',
      'relationship:Tour__c.Lead__c:1:looks up to it',
    ]);
    expect(index.objects.Lead.references).toEqual([]);
  });
});

describe('SOQL field uses', () => {
  it('names the select list and conditions of each query with its object, past subqueries and bind variables', () => {
    const code = "[SELECT Id, toLabel(Status), Owner.Name, (SELECT Subject FROM Tasks) FROM Lead WHERE Rank__c > 2 AND Center__c IN (SELECT Id FROM Center__c WHERE Active__c = true) AND Email = :email]";
    expect(soqlFieldUses(code).map((use) => `${use.object}.${use.field}`).sort()).toEqual([
      'Center__c.Active__c', 'Center__c.Id', 'Lead.Center__c', 'Lead.Email', 'Lead.Id', 'Lead.Rank__c', 'Lead.Status', 'Tasks.Subject',
    ]);
  });

  it('reads a query in a string (dynamic SOQL) to its closing quote', () => {
    expect(soqlFieldUses("Database.query('SELECT Name FROM Account WHERE Type = ' + t);").map((use) => `${use.object}.${use.field}`)).toEqual(['Account.Name', 'Account.Type']);
  });
});
