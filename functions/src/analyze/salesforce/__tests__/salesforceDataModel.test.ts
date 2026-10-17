import { reviewDiagram } from '../../contract/services/analyze/diagrams/diagramFile';
import type { SalesforceSourceFile } from '../SalesforceMetadataService';
import { buildSalesforceDataModel, describeFieldType, isStandardObject, sourceFileRef } from '../salesforceDataModel';

const ZIP = '/uploads/salesforce-metadata-kindercare.zip';

function zipped(path: string, content: string): SalesforceSourceFile {
  return { path, content, sizeBytes: content.length, sourcePath: ZIP };
}

function field(objectName: string, name: string, body: string): SalesforceSourceFile {
  return zipped(
    `force-app/main/default/objects/${objectName}/fields/${name}.field-meta.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">\n    <fullName>${name}</fullName>\n${body}\n</CustomField>`,
  );
}

function object(objectName: string, body: string): SalesforceSourceFile {
  return zipped(
    `force-app/main/default/objects/${objectName}/${objectName}.object-meta.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">\n${body}\n</CustomObject>`,
  );
}

/** A source-format workspace: centers, children, enrollments (a junction), a lookup to Contact. */
function workspace(): SalesforceSourceFile[] {
  return [
    object('Center__c', '<label>Center</label><description>A licensed site.</description><nameField><label>Center Name</label><type>Text</type></nameField>'),
    field('Center__c', 'Capacity__c', '<label>Licensed Capacity</label><type>Number</type><precision>4</precision><scale>0</scale><required>true</required>'),
    field('Center__c', 'Center_Code__c', '<label>Center Code</label><type>Text</type><length>10</length><unique>true</unique><externalId>true</externalId>'),
    object('Child__c', '<label>Child</label><nameField><label>Child Number</label><type>AutoNumber</type></nameField>'),
    field('Child__c', 'Guardian__c', '<label>Guardian</label><type>Lookup</type><referenceTo>Contact</referenceTo><relationshipName>Children</relationshipName><deleteConstraint>SetNull</deleteConstraint>'),
    object('Enrollment__c', '<label>Enrollment</label><nameField><label>Enrollment Name</label><type>Text</type></nameField>'),
    field('Enrollment__c', 'Child__c', '<label>Child</label><type>MasterDetail</type><referenceTo>Child__c</referenceTo>'),
    field('Enrollment__c', 'Center__c', '<label>Center</label><type>MasterDetail</type><referenceTo>Center__c</referenceTo>'),
    field('Enrollment__c', 'Status__c', '<label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><value><fullName>Pending</fullName><default>true</default><label>Pending</label></value><value><fullName>Active &amp; Billed</fullName><default>false</default><label>Active</label></value></valueSetDefinition></valueSet>'),
    field('Enrollment__c', 'Weekly_Rate__c', '<label>Weekly Rate</label><type>Currency</type><precision>16</precision><scale>2</scale><inlineHelpText>Billed each Monday.</inlineHelpText>'),
    field('Enrollment__c', 'Total__c', '<label>Total</label><type>Currency</type><formula>Weekly_Rate__c * 52</formula><precision>18</precision><scale>2</scale>'),
    field('Account', 'Region__c', '<label>Region</label><type>Picklist</type>'),
    // Not data objects: left out unless asked for.
    object('Rate_Setting__mdt', '<label>Rate Setting</label>'),
    field('Rate_Setting__mdt', 'Amount__c', '<label>Amount</label><type>Number</type><precision>8</precision><scale>2</scale>'),
    zipped('force-app/main/default/classes/CenterService.cls', 'public class CenterService {}'),
  ];
}

describe('buildSalesforceDataModel', () => {
  it('reads every custom object and the standard ones with fields, with types, flags, values and sources', () => {
    const { diagram, notFound, referenced } = buildSalesforceDataModel(workspace(), { uploadName: 'salesforce-metadata-kindercare.zip' });
    expect(notFound).toEqual([]);
    expect(referenced).toEqual(['Contact']);
    expect(diagram).toMatchObject({
      version: 1,
      kind: 'data_model',
      platform: 'salesforce',
      title: 'Salesforce data model',
      summary: '4 objects with their fields and relationships, read from salesforce-metadata-kindercare.zip.',
    });
    expect(diagram.entities.map((entity) => entity.id)).toEqual(['Account', 'Center__c', 'Child__c', 'Enrollment__c', 'Contact']);

    const center = diagram.entities.find((entity) => entity.id === 'Center__c')!;
    expect(center).toMatchObject({
      name: 'Center__c',
      label: 'Center',
      description: 'A licensed site.',
      source: `${ZIP}#force-app/main/default/objects/Center__c/Center__c.object-meta.xml`,
    });
    expect(center.fields).toEqual([
      { name: 'Name', label: 'Center Name', type: 'Text(80)', required: true },
      {
        name: 'Capacity__c', label: 'Licensed Capacity', type: 'Number(4,0)', required: true,
        source: `${ZIP}#force-app/main/default/objects/Center__c/fields/Capacity__c.field-meta.xml`,
      },
      {
        name: 'Center_Code__c', label: 'Center Code', type: 'Text(10)', unique: true, externalId: true,
        source: `${ZIP}#force-app/main/default/objects/Center__c/fields/Center_Code__c.field-meta.xml`,
      },
    ]);

    const enrollment = diagram.entities.find((entity) => entity.id === 'Enrollment__c')!;
    const byName = new Map(enrollment.fields.map((entry) => [entry.name, entry]));
    expect(byName.get('Child__c')).toMatchObject({ type: 'MasterDetail', required: true });
    expect(byName.get('Status__c')).toMatchObject({ type: 'Picklist', values: ['Pending', 'Active & Billed'] });
    expect(byName.get('Weekly_Rate__c')).toMatchObject({ type: 'Currency(16,2)', description: 'Billed each Monday.' });
    expect(byName.get('Total__c')).toMatchObject({ type: 'Formula(Currency)' });
    expect(diagram.entities.find((entity) => entity.id === 'Child__c')!.fields[0]).toEqual({ name: 'Name', label: 'Child Number', type: 'AutoNumber', required: true });

    // A standard object with only field files: the object is the platform's, the field is the upload's.
    expect(diagram.entities[0]).toMatchObject({ id: 'Account', source: 'platform', fields: [{ name: 'Region__c', type: 'Picklist' }] });
    expect(diagram.entities.at(-1)).toEqual({ id: 'Contact', name: 'Contact', source: 'platform', fields: [] });
  });

  it('draws master-details and lookups from the field that holds them', () => {
    const { diagram } = buildSalesforceDataModel(workspace());
    expect(diagram.relationships).toEqual([
      { id: 'Child__c.Guardian__c', kind: 'lookup', from: 'Child__c', to: 'Contact', field: 'Guardian__c', cardinality: { from: 'zero_or_more', to: 'zero_or_one' } },
      { id: 'Enrollment__c.Child__c', kind: 'master_detail', from: 'Enrollment__c', to: 'Child__c', field: 'Child__c', cardinality: { from: 'zero_or_more', to: 'exactly_one' } },
      { id: 'Enrollment__c.Center__c', kind: 'master_detail', from: 'Enrollment__c', to: 'Center__c', field: 'Center__c', cardinality: { from: 'zero_or_more', to: 'exactly_one' } },
    ]);
  });

  it('writes a file the review keeps as it is, with nothing to warn about', () => {
    const review = reviewDiagram(buildSalesforceDataModel(workspace()).diagram);
    expect(review.problems).toEqual([]);
    expect(review.warnings).toEqual([]);
  });

  it('takes the objects asked for, adds what they point at without fields, and says which it could not find', () => {
    const { diagram, notFound, referenced } = buildSalesforceDataModel(workspace(), { objects: ['enrollment__c', 'Rate_Setting__mdt', 'Waitlist__c'] });
    expect(notFound).toEqual(['Waitlist__c']);
    expect(referenced).toEqual(['Child__c', 'Center__c']);
    expect(diagram.entities.map((entity) => [entity.id, entity.fields.length])).toEqual([
      ['Enrollment__c', 6],
      ['Rate_Setting__mdt', 1],
      ['Child__c', 0],
      ['Center__c', 0],
    ]);
    // A custom object in the upload but not asked for keeps its own file as its source.
    expect(diagram.entities.find((entity) => entity.id === 'Center__c')).toMatchObject({
      label: 'Center',
      source: `${ZIP}#force-app/main/default/objects/Center__c/Center__c.object-meta.xml`,
    });
    expect(reviewDiagram(diagram).problems).toEqual([]);
  });

  it('reads the metadata format, with its fields inside the object file', () => {
    const legacy: SalesforceSourceFile = {
      path: 'unpackaged/objects/Invoice__c.object',
      sourcePath: '/uploads/unpackaged/objects/Invoice__c.object',
      sizeBytes: 0,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Invoice</label>
  <nameField><label>Invoice Number</label><type>AutoNumber</type></nameField>
  <fields><fullName>Account__c</fullName><label>Account</label><type>Lookup</type><referenceTo>Account</referenceTo><required>true</required></fields>
  <fields><fullName>Amount__c</fullName><label>Amount</label><type>Currency</type><precision>16</precision><scale>2</scale></fields>
</CustomObject>`,
    };
    const { diagram } = buildSalesforceDataModel([legacy]);
    expect(diagram.entities[0]).toEqual({
      id: 'Invoice__c',
      name: 'Invoice__c',
      label: 'Invoice',
      source: '/uploads/unpackaged/objects/Invoice__c.object',
      fields: [
        { name: 'Name', label: 'Invoice Number', type: 'AutoNumber', required: true },
        { name: 'Account__c', label: 'Account', type: 'Lookup', required: true },
        { name: 'Amount__c', label: 'Amount', type: 'Currency(16,2)' },
      ],
    });
    expect(diagram.relationships[0]).toMatchObject({ kind: 'lookup', to: 'Account', cardinality: { to: 'exactly_one' } });
    expect(reviewDiagram(diagram).problems).toEqual([]);
  });

  it('finds no objects in an upload without object metadata', () => {
    expect(buildSalesforceDataModel([zipped('force-app/main/default/classes/A.cls', 'class A {}')]).diagram.entities).toEqual([]);
  });
});

/** An org with installed packages (hed, Mogli_SMS), record types, sharing and value sets. */
function packagedWorkspace(): SalesforceSourceFile[] {
  return [
    zipped('sfdx-project.json', '{"packageDirectories":[{"path":"force-app","default":true}]}'),
    object('Lead', '<sharingModel>ReadWrite</sharingModel><externalSharingModel>Private</externalSharingModel>'),
    field('Lead', 'Status', '<type>Picklist</type>'),
    field('Lead', 'LeadSource', '<type>Picklist</type>'),
    field('Lead', 'Brand__c', '<label>Brand</label><type>Picklist</type><valueSet><valueSetName>Brand</valueSetName></valueSet>'),
    field('Lead', 'Course__c', '<label>Course</label><type>Lookup</type><referenceTo>hed__Course__c</referenceTo>'),
    field('Lead', 'Mogli_SMS__Mogli_Number__c', '<type>Text</type><length>20</length>'),
    field('Lead', 'Mogli_SMS__Opt_Out__c', '<type>Checkbox</type>'),
    zipped('force-app/main/default/objects/Lead/recordTypes/KLC_Leads.recordType-meta.xml', '<RecordType xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>KLC_Leads</fullName><active>false</active><label>KLC Leads</label></RecordType>'),
    zipped('force-app/main/default/objects/Lead/recordTypes/Creme_Family.recordType-meta.xml', '<RecordType xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Creme_Family</fullName><active>true</active><label>Creme Family</label><description>Creme brand families.</description></RecordType>'),
    object('hed__Course__c', '<label>Course</label><sharingModel>ReadWrite</sharingModel>'),
    field('hed__Course__c', 'hed__Account__c', '<type>Lookup</type><referenceTo>Account</referenceTo>'),
    object('hed__Program__c', '<label>Program</label>'),
    // A standard object with only package fields isn't drawn.
    field('Contact', 'hed__Gender__c', '<type>Picklist</type>'),
    object('Tour__c', '<label>Tour</label><sharingModel>ControlledByParent</sharingModel><nameField><label>Tour Name</label><type>Text</type></nameField>'),
    field('Tour__c', 'Lead__c', '<type>MasterDetail</type><referenceTo>Lead</referenceTo>'),
    zipped('force-app/main/default/standardValueSets/LeadStatus.standardValueSet-meta.xml', '<StandardValueSet xmlns="http://soap.sforce.com/2006/04/metadata"><sorted>false</sorted><standardValue><fullName>Open</fullName><default>true</default><label>Open</label></standardValue><standardValue><fullName>Toured</fullName><default>false</default><label>Toured</label></standardValue></StandardValueSet>'),
    zipped('force-app/main/default/standardValueSets/LeadSource.standardValueSet-meta.xml', '<StandardValueSet xmlns="http://soap.sforce.com/2006/04/metadata"><standardValue><fullName>Web</fullName></standardValue></StandardValueSet>'),
    zipped('force-app/main/default/globalValueSets/Brand.globalValueSet-meta.xml', '<GlobalValueSet xmlns="http://soap.sforce.com/2006/04/metadata"><customValue><fullName>KinderCare</fullName><default>false</default></customValue><customValue><fullName>Creme</fullName><default>false</default></customValue><masterLabel>Brand</masterLabel></GlobalValueSet>'),
  ];
}

describe('buildSalesforceDataModel: the org\'s own objects first', () => {
  it('draws the org\'s objects, package objects only where pointed at (collapsed), and counts package fields', () => {
    const { diagram, referenced, packageObjects, packageFieldCount } = buildSalesforceDataModel(packagedWorkspace(), { uploadName: 'qa.zip' });
    expect(diagram.entities.map((entity) => [entity.id, entity.fields.length])).toEqual([
      ['Lead', 4],
      ['Tour__c', 2],
      ['hed__Course__c', 0],
    ]);
    expect(referenced).toEqual(['hed__Course__c']);
    expect(packageObjects).toEqual(['hed__Course__c']);
    expect(packageFieldCount).toBe(2);
    expect(diagram.summary).toBe('2 objects with their fields and relationships, read from qa.zip. Objects from installed packages appear only where these point at them, collapsed (1). 2 fields from installed packages are counted on their objects, not drawn.');
    expect(diagram.entities.find((entity) => entity.id === 'hed__Course__c')).toEqual({
      id: 'hed__Course__c', name: 'hed__Course__c', label: 'Course', namespace: 'hed', managed: true, sharingModel: 'ReadWrite',
      source: `${ZIP}#force-app/main/default/objects/hed__Course__c/hed__Course__c.object-meta.xml`, fields: [],
    });
    expect(reviewDiagram(diagram)).toMatchObject({ problems: [], warnings: [] });
  });

  it('gives each object its sharing models, its record types, and its package fields count', () => {
    const lead = buildSalesforceDataModel(packagedWorkspace()).diagram.entities[0];
    expect(lead).toMatchObject({
      id: 'Lead', sharingModel: 'ReadWrite', externalSharingModel: 'Private', packageFieldCount: 2,
      recordTypes: [
        { name: 'Creme_Family', label: 'Creme Family', active: true, description: 'Creme brand families.', source: `${ZIP}#force-app/main/default/objects/Lead/recordTypes/Creme_Family.recordType-meta.xml` },
        { name: 'KLC_Leads', label: 'KLC Leads', active: false, source: `${ZIP}#force-app/main/default/objects/Lead/recordTypes/KLC_Leads.recordType-meta.xml` },
      ],
    });
    expect(lead.fields.map((entry) => entry.name)).toEqual(['Status', 'LeadSource', 'Brand__c', 'Course__c']);
  });

  it('fills picklists from the global value set they name and the standard value set a standard picklist reads', () => {
    const lead = buildSalesforceDataModel(packagedWorkspace()).diagram.entities[0];
    const byName = new Map(lead.fields.map((entry) => [entry.name, entry]));
    expect(byName.get('Status')).toMatchObject({ valueSet: 'LeadStatus', values: ['Open', 'Toured'] });
    expect(byName.get('LeadSource')).toMatchObject({ valueSet: 'LeadSource', values: ['Web'] });
    expect(byName.get('Brand__c')).toMatchObject({ valueSet: 'Brand', values: ['KinderCare', 'Creme'] });
  });

  it('shows a package object asked for by name with all its fields', () => {
    const { diagram } = buildSalesforceDataModel(packagedWorkspace(), { objects: ['hed__Course__c'] });
    expect(diagram.entities[0]).toMatchObject({ id: 'hed__Course__c', namespace: 'hed', managed: true, fields: [{ name: 'hed__Account__c' }] });
    expect(diagram.entities[0].packageFieldCount).toBeUndefined();
  });

  it('draws the platform\'s own lookups, whose metadata names no target, and leaves out owner fields', () => {
    const files = [
      ...workspace(),
      // Contact.AccountId's real metadata: a type, nothing else.
      field('Contact', 'AccountId', '<trackHistory>false</trackHistory><type>Lookup</type>'),
      field('Contact', 'OwnerId', '<type>Lookup</type>'),
      field('Account', 'ParentId', '<type>Hierarchy</type>'),
    ];
    const { diagram } = buildSalesforceDataModel(files, { objects: ['Account', 'Contact'] });
    expect(diagram.relationships.map((relationship) => `${relationship.from}.${relationship.field} -> ${relationship.to}`).sort()).toEqual([
      'Account.ParentId -> Account',
      'Contact.AccountId -> Account',
    ]);
  });

  it('draws every object in the workspace for ["*"]', () => {
    const { diagram, notFound } = buildSalesforceDataModel(workspace(), { objects: ['*'] });
    expect(notFound).toEqual([]);
    // The custom metadata type too: every object, not only the org's data objects.
    expect(diagram.entities.filter((entity) => entity.fields.length > 0).map((entity) => entity.id)).toEqual(['Account', 'Center__c', 'Child__c', 'Enrollment__c', 'Rate_Setting__mdt']);
  });

  it('reads an empty objects list as no list', () => {
    expect(buildSalesforceDataModel(packagedWorkspace(), { objects: [] }).diagram).toEqual(buildSalesforceDataModel(packagedWorkspace()).diagram);
    expect(buildSalesforceDataModel(packagedWorkspace(), { objects: ['  '] }).diagram.entities.length).toBeGreaterThan(0);
  });

  it('treats the workspace\'s own namespace (sfdx-project.json) as the org\'s', () => {
    const files = [
      zipped('sfdx-project.json', '{"namespace":"kc","packageDirectories":[{"path":"force-app"}]}'),
      object('kc__Center__c', '<label>Center</label>'),
      field('kc__Center__c', 'kc__Code__c', '<type>Text</type><length>10</length>'),
    ];
    const { diagram, packageFieldCount } = buildSalesforceDataModel(files);
    expect(diagram.entities.map((entity) => [entity.id, entity.fields.length, entity.managed ?? false])).toEqual([['kc__Center__c', 1, false]]);
    expect(packageFieldCount).toBe(0);
  });
});

describe('helpers', () => {
  it('names a source by its upload path, or its zip and entry', () => {
    expect(sourceFileRef({ path: 'objects/A__c/A__c.object-meta.xml', sourcePath: '/uploads/objects/A__c/A__c.object-meta.xml', content: '', sizeBytes: 0 }))
      .toBe('/uploads/objects/A__c/A__c.object-meta.xml');
    expect(sourceFileRef({ path: 'objects/A__c/A__c.object-meta.xml', sourcePath: ZIP, content: '', sizeBytes: 0 }))
      .toBe(`${ZIP}#objects/A__c/A__c.object-meta.xml`);
  });

  it('writes types with their sizes', () => {
    expect(describeFieldType({ type: 'Text', length: '255' })).toBe('Text(255)');
    expect(describeFieldType({ type: 'LongTextArea', length: '32768' })).toBe('LongTextArea(32768)');
    expect(describeFieldType({ type: 'Number', precision: '18' })).toBe('Number(18,0)');
    expect(describeFieldType({ type: 'Checkbox' })).toBe('Checkbox');
    expect(describeFieldType({ formula: 'TODAY()' })).toBe('Formula(Text)');
    expect(describeFieldType({})).toBeUndefined();
  });

  it('tells standard objects from custom ones', () => {
    expect(isStandardObject('Account')).toBe(true);
    expect(isStandardObject('Center__c')).toBe(false);
    expect(isStandardObject('ns__Thing__c')).toBe(false);
    expect(isStandardObject('Rate_Setting__mdt')).toBe(false);
  });
});
