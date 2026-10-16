/**
 * The access file of a Salesforce data model: for every object and field the
 * diagram draws, which profiles, permission sets and permission set groups
 * can read or edit it (and what a group's muting permission set takes away). `data_model` writes it next to the diagram; the field
 * access recipe reads it. Static: who holds each profile or permission set,
 * and which records they see, need the org.
 */
import type { DataModelDiagram } from '../contract/services/analyze/diagrams/diagramFile';
import type {
  AccessHolderKind,
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

export function buildSalesforceAccess(sourceFiles: SalesforceSourceFile[], diagram: DataModelDiagram, diagramFile: string): SalesforceAccessFile {
  const objects: Record<string, SalesforceObjectAccess> = {};
  const objectNames = new Map<string, string>();
  const fieldNames = new Map<string, { object: string; field: string }>();
  for (const entity of diagram.entities) {
    objects[entity.id] = { grants: [], fields: {} };
    objectNames.set(entity.id.toLowerCase(), entity.id);
    for (const field of entity.fields) {
      // The field's API name in the metadata, before any rename in the diagram.
      const name = field.source?.match(/fields\/([^/]+)\.field-meta\.xml$/i)?.[1] ?? field.name;
      fieldNames.set(`${entity.id}.${name}`.toLowerCase(), { object: entity.id, field: name });
      // Every drawn field is listed: one no one is granted (a required or system field) is open to whoever reads the object.
      objects[entity.id].fields[name] = { read: [], edit: [] };
    }
  }

  // Sharing models from the objects' own files.
  for (const file of sourceFiles) {
    const match = file.path.replace(/\\/g, '/').match(/(?:^|\/)objects\/([^/]+)\/\1\.object-meta\.xml$/i);
    const object = match ? objectNames.get(match[1].toLowerCase()) : undefined;
    if (!object) continue;
    const sharingModel = value(file.content, 'sharingModel');
    const externalSharingModel = value(file.content, 'externalSharingModel');
    if (sharingModel) objects[object].sharingModel = sharingModel;
    if (externalSharingModel) objects[object].externalSharingModel = externalSharingModel;
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
    }
    for (const body of blocks(content, 'fieldPermissions')) {
      const target = fieldNames.get((value(body, 'field') ?? '').toLowerCase());
      if (!target) continue;
      const readable = flag(body, 'readable');
      const editable = flag(body, 'editable');
      if (!readable && !editable) continue;
      const entry = objects[target.object].fields[target.field];
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
      'A field no profile or permission set is granted (a required or system field) has no field-level security: whoever can read the object can read it.',
      'Field permissions cover the fields the retrieve included.',
      'A permission set group\'s access is its permission sets, less what its muting permission set mutes.',
      'View All Fields on an object grants read on all its fields, so the holder\'s field permissions don\'t list them.',
    ],
  };
}
