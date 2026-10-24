import type { DataModelDiagram } from '../../contract/services/analyze/diagrams/diagramFile';
import type { SalesforceSourceFile } from '../SalesforceMetadataService';
import { buildSalesforceAccess } from '../salesforceAccess';

const D = 'force-app/main/default';

function file(path: string, content: string): SalesforceSourceFile {
  return { path: `${D}/${path}`, content, sizeBytes: content.length, sourcePath: '/uploads/qa.zip' };
}

const diagram: DataModelDiagram = {
  version: 1,
  kind: 'data_model',
  platform: 'salesforce',
  title: 'Leads',
  summary: 'Lead and its fields.',
  entities: [{
    id: 'Lead',
    name: 'Lead',
    fields: [
      { name: 'Status', type: 'Picklist' },
      { name: 'Ready_to_Convert__c', type: 'Checkbox', source: `/uploads/qa.zip#${D}/objects/Lead/fields/Ready_to_Convert__c.field-meta.xml` },
    ],
  }],
  relationships: [],
};

const objectPermission = (object: string, read: boolean, edit: boolean, viewAll = false, viewAllFields = false) =>
  `<objectPermissions><allowCreate>false</allowCreate><allowDelete>false</allowDelete><allowEdit>${edit}</allowEdit><allowRead>${read}</allowRead><modifyAllRecords>false</modifyAllRecords><object>${object}</object><viewAllFields>${viewAllFields}</viewAllFields><viewAllRecords>${viewAll}</viewAllRecords></objectPermissions>`;
const fieldPermission = (field: string, readable: boolean, editable: boolean) =>
  `<fieldPermissions><editable>${editable}</editable><field>${field}</field><readable>${readable}</readable></fieldPermissions>`;

describe('buildSalesforceAccess', () => {
  it('records who can read or edit each drawn field and object, through profiles, permission sets and groups', () => {
    const access = buildSalesforceAccess([
      file('objects/Lead/Lead.object-meta.xml', '<CustomObject><sharingModel>Private</sharingModel><externalSharingModel>Private</externalSharingModel></CustomObject>'),
      file('profiles/Business Analyst%28BSA%29.profile-meta.xml', `<Profile>${objectPermission('Lead', true, false)}${fieldPermission('Lead.Ready_to_Convert__c', true, false)}${fieldPermission('Lead.Status', false, false)}</Profile>`),
      file('profiles/Admin.profile-meta.xml', `<Profile>${objectPermission('Lead', true, true, true)}<userPermissions><enabled>true</enabled><name>ViewAllData</name></userPermissions><userPermissions><enabled>false</enabled><name>ModifyAllData</name></userPermissions></Profile>`),
      file('permissionsets/Lead_Editor.permissionset-meta.xml', `<PermissionSet><label>Lead Editor</label>${fieldPermission('Lead.Ready_to_Convert__c', true, true)}${fieldPermission('Contact.Email', true, true)}</PermissionSet>`),
      file('permissionsets/No_Lead_Edit.permissionset-meta.xml', '<PermissionSet><label>No_Lead_Edit</label></PermissionSet>'),
      file('permissionsetgroups/Lead_Team.permissionsetgroup-meta.xml', '<PermissionSetGroup><label>Lead Team</label><mutingPermissionSets>No_Lead_Edit</mutingPermissionSets><permissionSets>Lead_Editor</permissionSets><permissionSets>Not_In_Upload</permissionSets></PermissionSetGroup>'),
      file('permissionsets/Package_Set.permissionset-meta.xml', '(hidden)'),
      // A muting set mutes exactly what it lists (edit here, not read); its system permissions see nothing.
      file('mutingpermissionsets/Mute_Ready_Edit.mutingpermissionset-meta.xml', `<MutingPermissionSet><label>Mute Ready Edit</label>${fieldPermission('Lead.Ready_to_Convert__c', false, true)}<userPermissions><enabled>true</enabled><name>ViewAllData</name></userPermissions></MutingPermissionSet>`),
      file('permissionsetgroups/Lead_Readers.permissionsetgroup-meta.xml', '<PermissionSetGroup><label>Lead Readers</label><mutingPermissionSets>Mute_Ready_Edit</mutingPermissionSets><permissionSets>Lead_Editor</permissionSets></PermissionSetGroup>'),
      // View All Fields: read on every field, so its field permissions don't list them.
      file('permissionsets/Read_All_Lead.permissionset-meta.xml', `<PermissionSet><label>Read All Lead</label>${objectPermission('Lead', true, false, false, true)}</PermissionSet>`),
    ], diagram, 'leads.diagram.json');

    expect(access.holders.map((holder) => `${holder.kind}:${holder.name}`)).toEqual([
      'profile:Business Analyst(BSA)',
      'profile:Admin',
      'permissionSet:Lead_Editor',
      'permissionSet:No_Lead_Edit',
      'permissionSetGroup:Lead_Team',
      'mutingPermissionSet:Mute_Ready_Edit',
      'permissionSetGroup:Lead_Readers',
      'permissionSet:Read_All_Lead',
    ]);
    expect(access.holders[5].viewAllData).toBeUndefined();
    expect(access.holders[6]).toMatchObject({ permissionSets: [2], mutingPermissionSets: [5] });
    expect(access.holders[1]).toMatchObject({ viewAllData: true });
    expect(access.holders[1].modifyAllData).toBeUndefined();
    expect(access.holders[2]).toMatchObject({ label: 'Lead Editor', source: `/uploads/qa.zip#${D}/permissionsets/Lead_Editor.permissionset-meta.xml` });
    expect(access.holders[3].label).toBeUndefined();
    expect(access.holders[4]).toMatchObject({ permissionSets: [2], mutingPermissionSets: [3] });

    const lead = access.objects.Lead;
    expect(lead).toMatchObject({ sharingModel: 'Private', externalSharingModel: 'Private' });
    expect(lead.grants).toEqual([
      { holder: 0, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
      { holder: 1, read: true, create: false, edit: true, delete: false, viewAll: true, modifyAll: false },
      { holder: 7, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false, viewAllFields: true },
    ]);
    // Edit implies read; a field permission with neither is off; a field of an object the diagram doesn't draw is left out.
    expect(lead.fields).toEqual({ Status: { read: [], edit: [], off: [0] }, Ready_to_Convert__c: { read: [0, 2], edit: [2, 5] } });
    expect(access.objects.Contact).toBeUndefined();
  });

  it('lists every field on the drawn objects, Activity\'s on Task and Event, and marks the objects whose fields take no field permissions', () => {
    const source = (path: string) => `/uploads/qa.zip#${D}/${path}`;
    const access = buildSalesforceAccess([
      // A package field the diagram leaves off the org's object.
      file('objects/Lead/fields/SFGA__Web_Source__c.field-meta.xml', '<CustomField><fullName>SFGA__Web_Source__c</fullName><type>Text</type></CustomField>'),
      file('objects/Activity/fields/Temp_Related_To__c.field-meta.xml', '<CustomField><fullName>Temp_Related_To__c</fullName><type>Text</type></CustomField>'),
      file('objects/Field_Trip_Settings__c/Field_Trip_Settings__c.object-meta.xml', '<CustomObject><customSettingsType>Hierarchy</customSettingsType></CustomObject>'),
      file('profiles/Admin.profile-meta.xml', `<Profile>${objectPermission('Lead', true, true)}${objectPermission('Case', false, false)}`
        + '<customMetadataTypeAccesses><enabled>true</enabled><name>Holiday__mdt</name></customMetadataTypeAccesses>'
        + '<customSettingAccesses><enabled>false</enabled><name>Field_Trip_Settings__c</name></customSettingAccesses>'
        + fieldPermission('Lead.SFGA__Web_Source__c', false, false)
        + fieldPermission('Task.Temp_Related_To__c', false, false)
        + fieldPermission('Event.Temp_Related_To__c', true, false)
        // A standard field with no field file.
        + fieldPermission('Case.ClosedOnCreate', false, false)
        + fieldPermission('Holiday__mdt.Date__c', false, false)
        + fieldPermission('Convert_Lead__e.Lead_Id__c', false, false)
        + '</Profile>'),
      // A muting set's read off mutes nothing.
      file('mutingpermissionsets/Mute.mutingpermissionset-meta.xml', `<MutingPermissionSet>${fieldPermission('Lead.Status', false, false)}</MutingPermissionSet>`),
    ], {
      ...diagram,
      entities: [
        { id: 'Lead', name: 'Lead', fields: [{ name: 'Status', type: 'Picklist' }] },
        { id: 'Activity', name: 'Activity', fields: [{ name: 'Temp_Related_To__c', type: 'Text', source: source('objects/Activity/fields/Temp_Related_To__c.field-meta.xml') }] },
        { id: 'Case', name: 'Case', fields: [] },
        { id: 'Holiday__mdt', name: 'Holiday__mdt', fields: [{ name: 'Date__c', type: 'Date' }] },
        { id: 'Convert_Lead__e', name: 'Convert_Lead__e', fields: [{ name: 'Lead_Id__c', type: 'Text' }] },
        { id: 'Field_Trip_Settings__c', name: 'Field_Trip_Settings__c', fields: [{ name: 'Enabled__c', type: 'Checkbox' }] },
      ],
    }, 'admin.diagram.json');

    expect(access.objects.Lead.fields).toEqual({ Status: { read: [], edit: [] }, SFGA__Web_Source__c: { read: [], edit: [], off: [0] } });
    expect(access.objects.Activity.fields).toEqual({});
    expect(access.objects.Task.fields).toEqual({ Temp_Related_To__c: { read: [], edit: [], off: [0] } });
    expect(access.objects.Event.fields).toEqual({ Temp_Related_To__c: { read: [0], edit: [] } });
    expect(access.objects.Case.fields).toEqual({ ClosedOnCreate: { read: [], edit: [], off: [0] } });
    // Object permissions with everything off are kept apart from an object no holder names (Task: access set elsewhere).
    expect(access.objects.Case).toMatchObject({ grants: [], off: [0] });
    expect(access.objects.Task.grants).toEqual([]);
    expect(access.objects.Task.off).toBeUndefined();
    expect(access.objects.Lead.noFieldSecurity).toBeUndefined();
    expect(access.objects.Holiday__mdt).toMatchObject({
      noFieldSecurity: 'customMetadataType',
      grants: [{ holder: 0, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false }],
      fields: { Date__c: { read: [], edit: [], off: [0] } },
    });
    expect(access.objects.Convert_Lead__e.noFieldSecurity).toBe('platformEvent');
    // Access that isn't enabled grants nothing: it's off.
    expect(access.objects.Field_Trip_Settings__c).toMatchObject({ noFieldSecurity: 'customSetting', grants: [], off: [0] });
  });
});
