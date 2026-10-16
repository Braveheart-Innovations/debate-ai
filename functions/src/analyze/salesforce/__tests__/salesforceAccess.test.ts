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

const objectPermission = (object: string, read: boolean, edit: boolean, viewAll = false) =>
  `<objectPermissions><allowCreate>false</allowCreate><allowDelete>false</allowDelete><allowEdit>${edit}</allowEdit><allowRead>${read}</allowRead><modifyAllRecords>false</modifyAllRecords><object>${object}</object><viewAllRecords>${viewAll}</viewAllRecords></objectPermissions>`;
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
    ], diagram, 'leads.diagram.json');

    expect(access.holders.map((holder) => `${holder.kind}:${holder.name}`)).toEqual([
      'profile:Business Analyst(BSA)',
      'profile:Admin',
      'permissionSet:Lead_Editor',
      'permissionSet:No_Lead_Edit',
      'permissionSetGroup:Lead_Team',
    ]);
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
    ]);
    // Edit implies read; a grant of neither adds no one (Status is still listed); a field of an object the diagram doesn't draw is left out.
    expect(lead.fields).toEqual({ Status: { read: [], edit: [] }, Ready_to_Convert__c: { read: [0, 2], edit: [2] } });
    expect(access.objects.Contact).toBeUndefined();
  });
});
