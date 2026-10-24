/**
 * The access file of a Salesforce data model: for every object the diagram
 * draws and every field on it, which profiles, permission sets and permission
 * set groups can read or edit it (and what a group's muting permission set takes away). `data_model` writes it next to the diagram; the field
 * access recipe reads it. Static: who holds each profile or permission set,
 * and which records they see, need the org.
 *
 * Its fields are more than the diagram draws: package fields on the org's
 * objects, standard fields without a field file (`Case.ClosedOnCreate`) that a
 * field permission names, and Activity's custom fields, which Salesforce
 * permissions as `Task.X__c` and `Event.X__c`. A field permission with read
 * off is kept (`off`), and objects whose fields take no field permissions are
 * marked (`noFieldSecurity`), so a profile's "read off" on them isn't a gap.
 */
import type { DataModelDiagram } from '../contract/services/analyze/diagrams/diagramFile';
import type {
  AccessHolderKind,
  NoFieldSecurityKind,
  SalesforceAccessFile,
  SalesforceAccessHolder,
  SalesforceObjectAccess,
} from '../contract/services/analyze/diagrams/salesforceAccess';
import { sourceFileRef } from './salesforceDataModel';
import type { SalesforceSourceFile } from './SalesforceMetadataService';

const HOLDER_FILES: Array<{ kind: AccessHolderKind; pattern: RegExp }> = [
  { kind: 'profile', pattern: /(?:^|\/)profiles\/([^/]+)\.profile(?:-meta\.xml)?$/i },
  { kind: 'permissionSet', pattern: /(?:^|\/)permissionsets\/([^/]+)\.permissionset(?:-meta\.xml)?$/i },
  { kind: 'permissionSetGroup', pattern: /(?:^|\/)permissionsetgroups\/([^/]+)\.permissionsetgroup(?:-meta\.xml)?$/i },
  { kind: 'mutingPermissionSet', pattern: /(?:^|\/)mutingpermissionsets\/([^/]+)\.mutingpermissionset(?:-meta\.xml)?$/i },
];

function blocks(content: string, tag: string): string[] {
  return [...content.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) => match[1]);
}

function value(body: string, tag: string): string | undefined {
  return body.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`))?.[1];
}

function flag(body: string, tag: string): boolean {
  return value(body, tag) === 'true';
}

/** A profile's name from its file: `Business Analyst%28BSA%29` reads `Business Analyst(BSA)`. */
function decodedName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** Custom activity fields are defined on Activity and permissioned on both of these. */
const ACTIVITY_OBJECTS = ['Task', 'Event'];

/** A custom metadata type or platform event, by its suffix (a custom setting is known by its object file). */
function noFieldSecurityBySuffix(apiName: string): NoFieldSecurityKind | undefined {
  if (/__mdt$/i.test(apiName)) return 'customMetadataType';
  if (/__e$/i.test(apiName)) return 'platformEvent';
  return undefined;
}

export function buildSalesforceAccess(sourceFiles: SalesforceSourceFile[], diagram: DataModelDiagram, diagramFile: string): SalesforceAccessFile {
  const objects: Record<string, SalesforceObjectAccess> = {};
  const objectNames = new Map<string, string>();
  const fieldNames = new Map<string, string>();
  const addObject = (apiName: string) => {
    if (objectNames.has(apiName.toLowerCase())) return;
    const noFieldSecurity = noFieldSecurityBySuffix(apiName);
    objects[apiName] = { ...(noFieldSecurity ? { noFieldSecurity } : {}), grants: [], fields: {} };
    objectNames.set(apiName.toLowerCase(), apiName);
  };
  /** Where a field defined on an object is permissioned: Activity's on Task and Event. */
  const permissionedOn = (object: string) => (object.toLowerCase() === 'activity'
    ? ACTIVITY_OBJECTS.map((name) => objectNames.get(name.toLowerCase()) ?? name)
    : [object]);
  /** The field's entry, listed the first time it's seen. One no holder names (a required or system field) is open to whoever reads the object. */
  const fieldEntry = (object: string, name: string) => {
    const key = `${object}.${name}`.toLowerCase();
    let field = fieldNames.get(key);
    if (!field) {
      field = name;
      fieldNames.set(key, field);
      objects[object].fields[field] = { read: [], edit: [] };
    }
    return objects[object].fields[field];
  };

  for (const entity of diagram.entities) {
    addObject(entity.id);
    for (const object of permissionedOn(entity.id)) addObject(object);
    for (const field of entity.fields) {
      // The field's API name in the metadata, before any rename in the diagram.
      const name = field.source?.match(/fields\/([^/]+)\.field-meta\.xml$/i)?.[1] ?? field.name;
      for (const object of permissionedOn(entity.id)) fieldEntry(object, name);
    }
  }

  for (const file of sourceFiles) {
    const path = file.path.replace(/\\/g, '/');
    // Every field file of the objects, drawn or not (the diagram leaves package fields off the org's objects).
    const fieldFile = path.match(/(?:^|\/)objects\/([^/]+)\/fields\/([^/]+)\.field-meta\.xml$/i);
    if (fieldFile) {
      const object = objectNames.get(fieldFile[1].toLowerCase());
      if (object) for (const permissioned of permissionedOn(object)) fieldEntry(permissioned, fieldFile[2]);
      continue;
    }
    // Sharing models, and which objects are custom settings, from the objects' own files.
    const match = path.match(/(?:^|\/)objects\/([^/]+)\/\1\.object-meta\.xml$/i);
    const object = match ? objectNames.get(match[1].toLowerCase()) : undefined;
    if (!object) continue;
    const sharingModel = value(file.content, 'sharingModel');
    const externalSharingModel = value(file.content, 'externalSharingModel');
    if (sharingModel) objects[object].sharingModel = sharingModel;
    if (externalSharingModel) objects[object].externalSharingModel = externalSharingModel;
    if (value(file.content, 'customSettingsType')) objects[object].noFieldSecurity = 'customSetting';
  }

  const holders: SalesforceAccessHolder[] = [];
  const holderIndex = new Map<string, number>();
  const files: Array<{ file: SalesforceSourceFile; kind: AccessHolderKind; index: number }> = [];
  for (const file of sourceFiles) {
    if (!file.content || file.content.trim() === '(hidden)') continue;
    const path = file.path.replace(/\\/g, '/');
    for (const { kind, pattern } of HOLDER_FILES) {
      const match = path.match(pattern);
      if (!match) continue;
      const name = kind === 'profile' ? decodedName(match[1]) : match[1];
      const label = value(file.content, 'label');
      const holder: SalesforceAccessHolder = { kind, name, ...(label && label !== name ? { label } : {}), source: sourceFileRef(file) };
      // A muting set's permissions take away; they don't see anything.
      for (const permission of kind === 'mutingPermissionSet' ? [] : blocks(file.content, 'userPermissions')) {
        if (!flag(permission, 'enabled')) continue;
        if (value(permission, 'name') === 'ViewAllData') holder.viewAllData = true;
        if (value(permission, 'name') === 'ModifyAllData') holder.modifyAllData = true;
      }
      holderIndex.set(`${kind}:${name.toLowerCase()}`, holders.length);
      files.push({ file, kind, index: holders.length });
      holders.push(holder);
      break;
    }
  }

  for (const { file, kind, index } of files) {
    const content = file.content;
    if (kind === 'permissionSetGroup') {
      const sets = (tag: string, kinds: AccessHolderKind[]) => [...content.matchAll(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'g'))]
        .map((match) => kinds.map((setKind) => holderIndex.get(`${setKind}:${match[1].toLowerCase()}`)).find((found) => found !== undefined))
        .filter((found): found is number => found !== undefined);
      const included = sets('permissionSets', ['permissionSet']);
      const muting = sets('mutingPermissionSets', ['mutingPermissionSet', 'permissionSet']);
      if (included.length > 0) holders[index].permissionSets = included;
      if (muting.length > 0) holders[index].mutingPermissionSets = muting;
      continue;
    }
    for (const body of blocks(content, 'objectPermissions')) {
      const object = objectNames.get((value(body, 'object') ?? '').toLowerCase());
      if (!object) continue;
      const grant = {
        holder: index,
        read: flag(body, 'allowRead'),
        create: flag(body, 'allowCreate'),
        edit: flag(body, 'allowEdit'),
        delete: flag(body, 'allowDelete'),
        viewAll: flag(body, 'viewAllRecords'),
        modifyAll: flag(body, 'modifyAllRecords'),
        ...(flag(body, 'viewAllFields') ? { viewAllFields: true } : {}),
      };
      if (grant.read || grant.create || grant.edit || grant.delete || grant.viewAll || grant.modifyAll || grant.viewAllFields) objects[object].grants.push(grant);
      else if (kind !== 'mutingPermissionSet') (objects[object].off ??= []).push(index);
    }
    // Custom metadata types and custom settings aren't in objectPermissions: their access is read.
    for (const body of [...blocks(content, 'customMetadataTypeAccesses'), ...blocks(content, 'customSettingAccesses')]) {
      const object = objectNames.get((value(body, 'name') ?? '').toLowerCase());
      if (!object) continue;
      if (flag(body, 'enabled')) objects[object].grants.push({ holder: index, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false });
      else if (kind !== 'mutingPermissionSet') (objects[object].off ??= []).push(index);
    }
    for (const body of blocks(content, 'fieldPermissions')) {
      const [objectName, fieldName] = (value(body, 'field') ?? '').split('.');
      const object = objectNames.get((objectName ?? '').toLowerCase());
      if (!object || !fieldName) continue;
      const entry = fieldEntry(object, fieldName);
      const readable = flag(body, 'readable');
      const editable = flag(body, 'editable');
      if (!readable && !editable) {
        // Read off; a muting set's mutes nothing.
        if (kind !== 'mutingPermissionSet') (entry.off ??= []).push(index);
        continue;
      }
      // Edit access implies read; a muting set mutes exactly what it lists.
      if (readable || kind !== 'mutingPermissionSet') entry.read.push(index);
      if (editable) entry.edit.push(index);
    }
  }

  return {
    version: 1,
    kind: 'salesforce_access',
    diagram: diagramFile,
    generatedAt: new Date().toISOString(),
    holders,
    objects,
    limits: [
      'Who can, not who does: how many active users hold each profile, permission set or group needs the org (aggregate counts of assignments).',
      'Record-level visibility (roles, sharing rules, teams, the records themselves) isn\'t computed; each object\'s sharing model is the starting point.',
      'An object no profile or permission set names in object permissions gets its access elsewhere (a parent object, or a permission such as Edit Tasks); View All Data and Modify All Data read every object.',
      'A field no profile or permission set names (a required or system field) has no field-level security: whoever can read the object can read it.',
      'Fields cover every field on the objects the diagram draws, drawn or not: each field file and each field a field permission names. Activity\'s custom fields are on Task and Event, where Salesforce sets their field permissions.',
      'A field permission with read off is listed in off. It hides nothing on a platform event, custom metadata type or custom setting (noFieldSecurity): their fields follow access to the object. Whether any other field takes field permissions at all only the org shows (EntityParticle.IsPermissionable).',
      'Field permissions cover the fields the retrieve included.',
      'A permission set group\'s access is its permission sets, less what its muting permission set mutes.',
      'View All Fields on an object grants read on all its fields, so the holder\'s field permissions don\'t list them.',
    ],
  };
}
