/**
 * The references index of a Salesforce data model: for every object and field
 * the diagram draws, what in the workspace refers to it, resolved to the
 * object, with the file and line. `data_model` writes it next to the diagram;
 * the Diagram view reads it to show what an edit touches.
 *
 * One pass over the workspace, a reader per kind of metadata:
 *  - Apex: SOQL (fields in the select list and conditions of a query on the
 *    object), `Object.Field` names, custom field names only one object has,
 *    `.Field__c` in a trigger on the object, and for custom objects their uses
 *    as a type.
 *  - Flows: `<field>` inside an element on the object, `$Record.Field` and
 *    entry conditions of a flow on the object.
 *  - The object's own folder (validation rules, formula fields, list views,
 *    field sets, compact layouts, record types, buttons and links), layouts,
 *    Lightning pages, quick actions, paths, workflow, assignment, auto-response
 *    and escalation rules, duplicate and matching rules, sharing rules, reports
 *    and report types, email template merge fields, Lightning components and
 *    Visualforce.
 *  - Field-level security as counts; which layouts, record types, Lightning
 *    pages, permission sets and profiles an object has, for a new field's to-do.
 *  - Labels written out as text ("mentions"), for custom object labels that
 *    aren't the API name and custom field labels of two or more words.
 *
 * Static, like the audit: dynamic Apex (field names built as strings), record
 * changes that start other automation, and references by label alone aren't
 * seen. The index says so in `limits`.
 */
import type { DataModelDiagram } from '../contract/services/analyze/diagrams/diagramFile';
import type {
  ReferenceKind,
  SalesforceFieldReferences,
  SalesforceObjectReferences,
  SalesforceReference,
  SalesforceReferencesIndex,
} from '../contract/services/analyze/diagrams/salesforceReferences';
import { isStandardObject, sourceFileRef } from './salesforceDataModel';
import type { SalesforceSourceFile } from './SalesforceMetadataService';
import { baseName, lineFinder, placeOf, tagValues, withoutComments } from './salesforceSourceText';
import { buildSalesforceCalls } from './salesforceCalls';

interface Target {
  object: string;
  field?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SOQL_WORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'like', 'limit', 'order', 'by', 'asc', 'desc', 'nulls', 'first',
  'last', 'group', 'having', 'count', 'count_distinct', 'typeof', 'when', 'then', 'else', 'end', 'with', 'security_enforced',
  'user_mode', 'system_mode', 'for', 'update', 'view', 'reference', 'offset', 'includes', 'excludes', 'true', 'false', 'null',
  'all', 'rows', 'tolabel', 'format', 'convertcurrency', 'max', 'min', 'sum', 'avg', 'calendar_year', 'calendar_month',
  'day_only', 'fiscal_year', 'rollup', 'cube', 'above', 'below', 'at', 'data', 'category', 'using', 'scope',
]);

/**
 * The fields each SOQL query in the code names, with the object it queries:
 * the select list and the rest of the query at its own depth. Nested queries
 * (child relationships, semi-joins) are their own; bind variables (`:x`) and
 * dotted paths through a relationship are left out.
 */
export function soqlFieldUses(code: string): Array<{ object: string; field: string; offset: number }> {
  const uses: Array<{ object: string; field: string; offset: number }> = [];
  interface Frame { depth: number; fields: Array<{ name: string; offset: number }>; object?: string }
  const frames: Frame[] = [];
  let depth = 0;
  const tokens = /:\s*[A-Za-z_][A-Za-z0-9_.]*|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|[()[\];']/g;
  let expectObject = false;
  for (let match = tokens.exec(code); match; match = tokens.exec(code)) {
    const token = match[0];
    if (token === '(') { depth += 1; continue; }
    if (token === ')') {
      while (frames.length > 0 && frames[frames.length - 1].depth >= depth) frames.pop();
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (token === ']' || token === ';' || token === "'") {
      // The end of a query (or of the string that holds it) at this depth.
      while (frames.length > 0 && frames[frames.length - 1].depth >= depth) frames.pop();
      expectObject = false;
      continue;
    }
    if (token === '[') continue;
    if (token.startsWith(':')) continue;
    const lower = token.toLowerCase();
    if (lower === 'select') {
      frames.push({ depth, fields: [] });
      expectObject = false;
      continue;
    }
    const frame = frames[frames.length - 1];
    if (!frame || frame.depth > depth) continue;
    if (lower === 'from' && frame.depth === depth && !frame.object) { expectObject = true; continue; }
    if (expectObject) {
      expectObject = false;
      frame.object = token;
      for (const field of frame.fields) uses.push({ object: token, field: field.name, offset: field.offset });
      frame.fields = [];
      continue;
    }
    if (SOQL_WORDS.has(lower) || token.includes('.')) continue;
    if (frame.object) uses.push({ object: frame.object, field: token, offset: match.index });
    else frame.fields.push({ name: token, offset: match.index });
  }
  return uses;
}

/** Blocks of an XML element, with the offset of each. */
function blocks(content: string, tag: string): Array<{ body: string; offset: number }> {
  const found: Array<{ body: string; offset: number }> = [];
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  for (let match = pattern.exec(content); match; match = pattern.exec(content)) found.push({ body: match[1], offset: match.index + tag.length + 2 });
  return found;
}

function emptyObject(): SalesforceObjectReferences {
  return {
    references: [],
    labelMentions: [],
    surface: { layouts: [], recordTypes: [], flexipages: [], permissionSets: { read: [], edit: [] }, profiles: { read: [], edit: [] } },
    fields: {},
  };
}

/** A field's API name before any rename: the name in its source file, else its name. */
function metadataFieldName(object: string, field: { name: string; source?: string }): string {
  const match = field.source?.match(new RegExp(`objects/${escapeRegExp(object)}/fields/([^/]+)\\.field-meta\\.xml$`, 'i'));
  return match ? match[1] : field.name;
}

export function buildSalesforceReferenceIndex(
  sourceFiles: SalesforceSourceFile[],
  diagram: DataModelDiagram,
  diagramFile: string,
): SalesforceReferencesIndex {
  const objects: Record<string, SalesforceObjectReferences> = {};
  /** Lower-case object name → its API name, for the objects the diagram draws. */
  const objectNames = new Map<string, string>();
  /** Lower-case `object.field` → the object and field. */
  const fieldNames = new Map<string, Target>();
  /** Lower-case field name → the drawn objects that have it. */
  const fieldOwners = new Map<string, string[]>();
  const fieldLabels = new Map<string, string>();
  for (const entity of diagram.entities) {
    objects[entity.id] = emptyObject();
    objectNames.set(entity.id.toLowerCase(), entity.id);
    for (const field of entity.fields) {
      const name = metadataFieldName(entity.id, field);
      objects[entity.id].fields[name] = { references: [] };
      fieldNames.set(`${entity.id}.${name}`.toLowerCase(), { object: entity.id, field: name });
      fieldOwners.set(name.toLowerCase(), [...(fieldOwners.get(name.toLowerCase()) ?? []), entity.id]);
      if (field.label && /__c$/i.test(name) && isPhrase(field.label)) fieldLabels.set(`${entity.id}.${name}`, field.label.trim());
    }
  }

  // A custom field name that only one object in the whole workspace has names that field wherever it appears.
  const workspaceFieldOwners = new Map<string, Set<string>>();
  for (const file of sourceFiles) {
    const match = file.path.replace(/\\/g, '/').match(/(?:^|\/)objects\/([^/]+)\/fields\/([^/]+__c)\.field-meta\.xml$/i);
    if (match) workspaceFieldOwners.set(match[2].toLowerCase(), new Set([...(workspaceFieldOwners.get(match[2].toLowerCase()) ?? []), match[1].toLowerCase()]));
  }
  const uniqueCustomField = (name: string): Target | undefined => {
    const lower = name.toLowerCase();
    if (!lower.endsWith('__c') || (workspaceFieldOwners.get(lower)?.size ?? 0) > 1) return undefined;
    const owners = fieldOwners.get(lower) ?? [];
    return owners.length === 1 ? { object: owners[0], field: fieldNames.get(`${owners[0]}.${name}`.toLowerCase())?.field ?? name } : undefined;
  };
  const objectNamed = (name: string | undefined) => (name ? objectNames.get(name.toLowerCase()) : undefined);
  const fieldOf = (object: string | undefined, name: string | undefined): Target | undefined => {
    if (!object || !name) return undefined;
    return fieldNames.get(`${object}.${name}`.toLowerCase());
  };

  const seen = new Set<string>();
  const add = (target: Target | undefined, reference: SalesforceReference) => {
    if (!target) return;
    const object = objects[target.object];
    if (!object) return;
    const key = `${target.object}|${target.field ?? ''}|${reference.file}|${reference.line}|${reference.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (target.field) object.fields[target.field]?.references.push(reference);
    else if (!isStandardObject(target.object)) object.references.push(reference);
  };

  /** The profiles and permission sets that read and edit each field, by name: Activity's fields are permissioned on Task and Event, once per holder. */
  const fieldAccess = new Map<string, { ps: { read: Set<string>; edit: Set<string> }; pr: { read: Set<string>; edit: Set<string> } }>();
  /** The index's file table: each source once, references point at it. */
  const files: string[] = [];
  const fileIds = new Map<string, number>();
  const fileById: SalesforceSourceFile[] = [];
  const fileId = (file: SalesforceSourceFile): number => {
    const source = sourceFileRef(file);
    let id = fileIds.get(source);
    if (id === undefined) {
      id = files.length;
      files.push(source);
      fileIds.set(source, id);
      fileById.push(file);
    }
    return id;
  };

  for (const file of sourceFiles) {
    const place = placeOf(file.path);
    if (!place) continue;
    const { folder, rest } = place;
    const content = file.content;
    if (!content || content.trim() === '(hidden)') continue;
    const lineAt = lineFinder(content);
    const ref = (kind: ReferenceKind, component: string, offset: number, how?: string): SalesforceReference => ({ file: fileId(file), line: lineAt(offset), kind, component, ...(how ? { how } : {}) });

    if (folder === 'classes' || folder === 'triggers') {
      if (!/\.(cls|trigger)$/i.test(rest)) continue;
      const kind: ReferenceKind = folder === 'triggers' ? 'trigger' : 'apex';
      const component = baseName(rest);
      const code = withoutComments(content);
      const triggerObject = folder === 'triggers' ? objectNamed(code.match(/\btrigger\s+\w+\s+on\s+(\w+)/i)?.[1]) : undefined;
      for (const use of soqlFieldUses(code)) {
        const object = objectNamed(use.object);
        add(object ? { object } : undefined, ref(kind, component, use.offset, 'SOQL'));
        add(fieldOf(object, use.field), ref(kind, component, use.offset, 'SOQL'));
      }
      for (const match of code.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g)) {
        add(fieldOf(objectNamed(match[1]), match[2]), ref(kind, component, match.index ?? 0, `${match[1]}.${match[2]}`));
      }
      for (const match of code.matchAll(/\b([A-Za-z_]\w*__c)\b/g)) {
        add(uniqueCustomField(match[1]), ref(kind, component, match.index ?? 0, 'names the field'));
        const object = objectNamed(match[1]);
        if (object) add({ object }, ref(kind, component, match.index ?? 0, 'names the object'));
      }
      if (triggerObject) {
        add({ object: triggerObject }, ref(kind, component, code.search(/\btrigger\b/i), 'trigger on it'));
        for (const match of code.matchAll(/\.([A-Za-z_]\w*__c)\b/g)) add(fieldOf(triggerObject, match[1]), ref(kind, component, match.index ?? 0, `trigger on ${triggerObject}`));
      }
      continue;
    }

    if (folder === 'flows') {
      if (!/\.flow(-meta\.xml)?$/i.test(rest)) continue;
      const component = baseName(rest).replace(/\.flow$/i, '');
      const startBlock = blocks(content, 'start')[0];
      const startObject = objectNamed(startBlock?.body.match(/<object>([^<]+)<\/object>/)?.[1]?.trim());
      if (startObject && startBlock) {
        add({ object: startObject }, ref('flow', component, startBlock.offset, 'starts on it'));
        for (const field of tagValues(startBlock.body, 'field')) add(fieldOf(startObject, field.value), ref('flow', component, startBlock.offset + field.offset, 'entry condition'));
      }
      for (const tag of ['recordLookups', 'recordUpdates', 'recordCreates', 'recordDeletes']) {
        for (const block of blocks(content, tag)) {
          const named = block.body.match(/<object>([^<]+)<\/object>/)?.[1]?.trim();
          const object = objectNamed(named) ?? (/<inputReference>\$Record<\/inputReference>/.test(block.body) ? startObject : undefined);
          if (!object) continue;
          const how = { recordLookups: 'gets records', recordUpdates: 'updates records', recordCreates: 'creates records', recordDeletes: 'deletes records' }[tag];
          add({ object }, ref('flow', component, block.offset, how));
          for (const field of [...tagValues(block.body, 'field'), ...tagValues(block.body, 'queriedFields')]) {
            add(fieldOf(object, field.value), ref('flow', component, block.offset + field.offset, tag === 'recordLookups' ? 'reads or filters on it' : tag === 'recordUpdates' ? 'sets or filters on it' : 'sets it'));
          }
        }
      }
      if (startObject) {
        for (const match of content.matchAll(/\$Record(?:__Prior)?\.([A-Za-z_]\w*)/g)) add(fieldOf(startObject, match[1]), ref('flow', component, match.index ?? 0, match[0].startsWith('$Record__Prior') ? 'prior value' : '$Record'));
      }
      for (const match of content.matchAll(/\b([A-Za-z_]\w*__c)\b/g)) {
        // `<object>Center__c</object>` names an object, not a field.
        if (content.slice(Math.max(0, (match.index ?? 0) - 8), match.index).endsWith('<object>')) continue;
        add(uniqueCustomField(match[1]), ref('flow', component, match.index ?? 0, 'names the field'));
      }
      continue;
    }

    if (folder === 'objects') {
      const parts = rest.split('/');
      const object = objectNamed(parts[0]);
      const sub = parts.length > 2 ? parts[1] : '';
      const component = parts.length > 2 ? `${parts[0]}.${baseName(parts[parts.length - 1])}` : parts[0];
      // A field elsewhere that looks up to a drawn object.
      if (sub === 'fields') {
        for (const target of tagValues(content, 'referenceTo')) {
          const pointed = objectNamed(target.value);
          if (pointed) add({ object: pointed }, ref('relationship', component, target.offset, 'looks up to it'));
        }
        for (const key of [...tagValues(content, 'summaryForeignKey'), ...tagValues(content, 'summarizedField')]) {
          const [childObject, childField] = key.value.split('.');
          add(fieldOf(objectNamed(childObject), childField), ref('formula', component, key.offset, 'roll-up summary'));
        }
      }
      if (!object) continue;
      if (sub === 'validationRules') {
        const formula = blocks(content, 'errorConditionFormula')[0];
        if (formula) for (const field of formulaFields(formula.body)) add(fieldOf(object, field.name), ref('validationRule', component, formula.offset + field.offset, 'in the condition'));
      } else if (sub === 'fields') {
        const formula = blocks(content, 'formula')[0];
        if (formula) for (const field of formulaFields(formula.body)) add(fieldOf(object, field.name), ref('formula', component, formula.offset + field.offset, 'in the formula'));
        for (const controlling of tagValues(content, 'controllingField')) add(fieldOf(object, controlling.value), ref('formula', component, controlling.offset, 'controls its values'));
      } else if (sub === 'listViews') {
        for (const column of [...tagValues(content, 'columns'), ...tagValues(content, 'field')]) {
          const name = column.value.includes('.') ? column.value.split('.').pop()! : column.value;
          add(fieldOf(object, name) ?? standardColumn(object, column.value, fieldNames), ref('listView', component, column.offset, 'column or filter'));
        }
      } else if (sub === 'fieldSets') {
        for (const field of tagValues(content, 'field')) add(fieldOf(object, field.value), ref('fieldSet', component, field.offset));
      } else if (sub === 'compactLayouts') {
        for (const field of tagValues(content, 'fields')) add(fieldOf(object, field.value), ref('compactLayout', component, field.offset));
      } else if (sub === 'recordTypes') {
        objects[object].surface.recordTypes.push(baseName(parts[parts.length - 1]));
        for (const picklist of tagValues(content, 'picklist')) add(fieldOf(object, picklist.value), ref('recordType', component, picklist.offset, 'picklist values'));
      } else if (sub === 'webLinks') {
        for (const match of content.matchAll(/\{!\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\}/g)) add(fieldOf(objectNamed(match[1]), match[2]), ref('other', component, match.index ?? 0, 'merge field'));
      }
      continue;
    }

    const component = baseName(rest);
    if (folder === 'layouts') {
      const object = objectNamed(rest.split('-')[0]);
      if (!object) continue;
      objects[object].surface.layouts.push(component);
      add({ object }, ref('layout', component, 0, 'layout of it'));
      for (const field of tagValues(content, 'field')) add(fieldOf(object, field.value), ref('layout', component, field.offset));
      continue;
    }
    if (folder === 'flexipages') {
      const object = objectNamed(content.match(/<sobjectType>([^<]+)<\/sobjectType>/)?.[1]?.trim());
      if (!object) continue;
      objects[object].surface.flexipages.push(component);
      add({ object }, ref('flexipage', component, content.indexOf('<sobjectType>'), 'record page'));
      for (const match of content.matchAll(/Record\.([A-Za-z_]\w*)/g)) add(fieldOf(object, match[1]), ref('flexipage', component, match.index ?? 0));
      continue;
    }
    if (folder === 'quickActions') {
      const object = objectNamed(component.split('.')[0]);
      if (object) add({ object }, ref('quickAction', component, 0, 'action on it'));
      const target = objectNamed(content.match(/<targetObject>([^<]+)<\/targetObject>/)?.[1]?.trim()) ?? object;
      for (const field of tagValues(content, 'field')) add(fieldOf(target, field.value), ref('quickAction', component, field.offset));
      continue;
    }
    if (folder === 'pathAssistants') {
      const object = objectNamed(content.match(/<entityName>([^<]+)<\/entityName>/)?.[1]?.trim());
      for (const field of tagValues(content, 'fieldName')) add(fieldOf(object, field.value), ref('pathAssistant', component, field.offset, 'path field'));
      continue;
    }
    if (folder === 'workflows' || folder === 'assignmentRules' || folder === 'autoResponseRules' || folder === 'escalationRules') {
      const object = objectNamed(component.split('.')[0]);
      if (!object) continue;
      const kind: ReferenceKind = folder === 'workflows' ? 'workflow' : 'assignmentRule';
      add({ object }, ref(kind, component, 0, 'rules on it'));
      for (const field of tagValues(content, 'field')) {
        const [first, second] = field.value.split('.');
        add(second ? fieldOf(objectNamed(first), second) : fieldOf(object, first), ref(kind, component, field.offset, folder === 'workflows' && !second ? 'field update' : 'criteria'));
      }
      for (const formula of blocks(content, 'formula')) for (const field of formulaFields(formula.body)) add(fieldOf(object, field.name), ref(kind, component, formula.offset + field.offset, 'in a formula'));
      continue;
    }
    if (folder === 'duplicateRules' || folder === 'matchingRules') {
      const object = objectNamed(component.split('.')[0]);
      for (const field of [...tagValues(content, 'field'), ...tagValues(content, 'fieldName')]) add(fieldOf(object, field.value), ref('duplicateRule', component, field.offset));
      continue;
    }
    if (folder === 'sharingRules') {
      const object = objectNamed(component);
      for (const field of tagValues(content, 'field')) add(fieldOf(object, field.value), ref('sharingRule', component, field.offset, 'criteria'));
      continue;
    }
    if (folder === 'reports') {
      if (!/\.report(-meta\.xml)?$/i.test(rest)) continue;
      const name = rest.replace(/\.report(-meta\.xml)?$/i, '');
      for (const match of content.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g)) add(fieldOf(objectNamed(match[1]), match[2]), ref('report', name, match.index ?? 0));
      for (const match of content.matchAll(/\b([A-Za-z_]\w*__c)\b/g)) add(uniqueCustomField(match[1]), ref('report', name, match.index ?? 0));
      continue;
    }
    if (folder === 'reportTypes') {
      const base = objectNamed(content.match(/<baseObject>([^<]+)<\/baseObject>/)?.[1]?.trim());
      if (base) add({ object: base }, ref('reportType', component, content.indexOf('<baseObject>'), 'base object'));
      for (const column of blocks(content, 'columns')) {
        const table = column.body.match(/<table>([^<]+)<\/table>/)?.[1]?.trim();
        const field = column.body.match(/<field>([^<]+)<\/field>/)?.[1]?.trim();
        // A column's table is the object, or a path through relationships ending at it.
        const object = objectNamed(table?.split('.').pop()) ?? objectNamed(table);
        add(fieldOf(object, field), ref('reportType', component, column.offset));
      }
      continue;
    }
    if (folder === 'email' || folder === 'pages' || folder === 'components') {
      const kind: ReferenceKind = folder === 'email' ? 'emailTemplate' : 'visualforce';
      const name = folder === 'email' ? rest.replace(/\.email(-meta\.xml)?$/i, '') : component;
      for (const match of content.matchAll(/\{!\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\}/g)) {
        const object = objectNamed(match[1]);
        add(fieldOf(object, match[2]), ref(kind, name, match.index ?? 0, 'merge field'));
        if (object) add({ object }, ref(kind, name, match.index ?? 0, 'merge field'));
      }
      const related = objectNamed(content.match(/<relatedEntityType>([^<]+)<\/relatedEntityType>/)?.[1]?.trim());
      if (related) add({ object: related }, ref(kind, name, content.indexOf('<relatedEntityType>'), 'related object'));
      continue;
    }
    if (folder === 'lwc' || folder === 'aura') {
      const name = rest.split('/')[0];
      for (const match of content.matchAll(/@salesforce\/schema\/([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?/g)) {
        const object = objectNamed(match[1]);
        add(match[2] ? fieldOf(object, match[2]) : object ? { object } : undefined, ref('lightningComponent', name, match.index ?? 0, 'schema import'));
      }
      continue;
    }
    if (folder === 'tabs') {
      const object = objectNamed(component);
      if (object) add({ object }, ref('tab', component, 0));
      continue;
    }
    if (folder === 'permissionsets' || folder === 'profiles') {
      const name = component;
      const group = folder === 'permissionsets' ? 'permissionSets' : 'profiles';
      for (const block of blocks(content, 'fieldPermissions')) {
        const field = block.body.match(/<field>([^<]+)<\/field>/)?.[1]?.trim();
        const [objectName, fieldName] = field?.split('.') ?? [];
        const activity = /^(task|event)$/i.test(objectName ?? '') ? fieldOf(objectNamed('Activity'), fieldName) : undefined;
        const target = fieldOf(objectNamed(objectName), fieldName) ?? activity;
        if (!target?.field) continue;
        const key = `${target.object}.${target.field}`;
        const access = fieldAccess.get(key) ?? { ps: { read: new Set<string>(), edit: new Set<string>() }, pr: { read: new Set<string>(), edit: new Set<string>() } };
        const holders = group === 'permissionSets' ? access.ps : access.pr;
        if (/<editable>true<\/editable>/.test(block.body)) holders.edit.add(name);
        if (/<readable>true<\/readable>/.test(block.body)) holders.read.add(name);
        fieldAccess.set(key, access);
      }
      for (const block of blocks(content, 'objectPermissions')) {
        const object = objectNamed(block.body.match(/<object>([^<]+)<\/object>/)?.[1]?.trim());
        if (!object) continue;
        const surface = objects[object].surface[group];
        if (/<allowRead>true<\/allowRead>/.test(block.body)) surface.read.push(name);
        if (/<allowEdit>true<\/allowEdit>/.test(block.body)) surface.edit.push(name);
      }
    }
  }

  for (const [key, access] of fieldAccess) {
    const [object, field] = key.split('.');
    const entry = objects[object]?.fields[field];
    if (entry) entry.access = { permissionSets: { read: access.ps.read.size, edit: access.ps.edit.size }, profiles: { read: access.pr.read.size, edit: access.pr.edit.size } };
  }

  const calls = buildSalesforceCalls(sourceFiles, fileId);
  addValueMentions(diagram, objects, fileById);
  addLabelMentions(sourceFiles, diagram, objects, fieldLabels, fileId);

  for (const object of Object.values(objects)) {
    object.references.sort(byPlace);
    object.labelMentions.sort(byPlace);
    for (const field of Object.values(object.fields)) {
      field.references.sort(byPlace);
      field.labelMentions?.sort(byPlace);
    }
    for (const list of [object.surface.layouts, object.surface.recordTypes, object.surface.flexipages, object.surface.permissionSets.read, object.surface.permissionSets.edit, object.surface.profiles.read, object.surface.profiles.edit]) list.sort();
  }

  return {
    version: 1,
    kind: 'salesforce_references',
    diagram: diagramFile,
    generatedAt: new Date().toISOString(),
    files,
    objects,
    calls,
    limits: [
      'Static references only: field names Apex builds as strings, and automation a record change starts, aren\'t seen.',
      'Calls are static too: a class or flow picked by name at run time, and a record change that starts other automation, aren\'t followed.',
      'A standard field in a report on a standard report type is written without its object, so only custom fields and Object.Field names are found in reports.',
      'Label mentions cover custom object and custom field labels of two or more words.',
    ],
  };
}

/** A label of two or more words: a single word ("Child", "Status") would match everywhere. */
function isPhrase(label: string): boolean {
  return /\S\s+\S/.test(label.trim());
}

function byPlace(a: SalesforceReference, b: SalesforceReference): number {
  return a.kind.localeCompare(b.kind) || a.component.localeCompare(b.component) || a.line - b.line;
}

/** Field names in a formula: bare identifiers, not functions or `$Globals`, not relationship paths. */
function formulaFields(formula: string): Array<{ name: string; offset: number }> {
  const found: Array<{ name: string; offset: number }> = [];
  for (const match of formula.matchAll(/(?<![$.\w"])([A-Za-z_]\w*)(?![\w.(])/g)) found.push({ name: match[1], offset: match.index ?? 0 });
  return found;
}

/** A standard list view column (`LEAD.STATUS`, `FULL_NAME`) as a field of the object, when it is one. */
function standardColumn(object: string, column: string, fieldNames: Map<string, Target>): Target | undefined {
  const [first, second] = column.split('.');
  if (second && first.toLowerCase() === object.toLowerCase()) {
    const normalized = second.replace(/_/g, '').toLowerCase();
    for (const [key, target] of fieldNames) {
      if (target.object === object && key.split('.')[1].replace(/_/g, '') === normalized) return target;
    }
  }
  return undefined;
}

/** For each picklist value, the places among the field's references that name it as a literal. */
function addValueMentions(diagram: DataModelDiagram, objects: Record<string, SalesforceObjectReferences>, fileById: SalesforceSourceFile[]): void {
  for (const entity of diagram.entities) {
    for (const field of entity.fields) {
      if (!field.values || field.values.length === 0) continue;
      const entry = objects[entity.id]?.fields[metadataFieldName(entity.id, field)];
      if (!entry) continue;
      const fileIdsUsed = [...new Set(entry.references.map((reference) => reference.file))];
      const mentions: NonNullable<SalesforceFieldReferences['valueMentions']> = {};
      for (const value of field.values) {
        const pattern = new RegExp(`(["'>]|&quot;)${escapeRegExp(value)}(["'<]|&quot;)`, 'g');
        for (const id of fileIdsUsed) {
          const file = fileById[id];
          if (!file) continue;
          const lineAt = lineFinder(file.content);
          for (const match of file.content.matchAll(pattern)) (mentions[value] ??= []).push({ file: id, line: lineAt(match.index ?? 0) });
        }
      }
      if (Object.keys(mentions).length > 0) entry.valueMentions = mentions;
    }
  }
}

/** Where object labels (when not the API name) and multi-word custom field labels appear as text. */
function addLabelMentions(
  sourceFiles: SalesforceSourceFile[],
  diagram: DataModelDiagram,
  objects: Record<string, SalesforceObjectReferences>,
  fieldLabels: Map<string, string>,
  fileId: (file: SalesforceSourceFile) => number,
): void {
  /** Lower-case label → what it labels. */
  const labels = new Map<string, Target[]>();
  const addLabel = (label: string | undefined, target: Target) => {
    const text = label?.trim();
    if (!text || !isPhrase(text)) return;
    labels.set(text.toLowerCase(), [...(labels.get(text.toLowerCase()) ?? []), target]);
  };
  for (const entity of diagram.entities) {
    if (!isStandardObject(entity.id) && entity.label) addLabel(entity.label, { object: entity.id });
  }
  for (const [key, label] of fieldLabels) {
    const [object, field] = key.split('.');
    addLabel(label, { object, field });
  }
  if (labels.size === 0) return;
  const pattern = new RegExp(`(?<![\\w])(${[...labels.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![\\w])`, 'gi');
  for (const file of sourceFiles) {
    const place = placeOf(file.path);
    if (!file.content || (!place && !/\.(xml|json|js|html|cls|trigger|page|component|email|labels)$/i.test(file.path))) continue;
    // Profiles and permission sets name layouts by their labels (`Center__c-Center Layout`): references, not text.
    if (place && (place.folder === 'profiles' || place.folder === 'permissionsets')) continue;
    const lineAt = lineFinder(file.content);
    const component = place ? baseName(place.rest).replace(/\.\w+$/, '') : file.path.split('/').pop()!;
    for (const match of file.content.matchAll(pattern)) {
      // A layout's name carries its object's label: a reference to the layout.
      if (/<layout>[^<]*$/.test(file.content.slice(Math.max(0, (match.index ?? 0) - 200), match.index))) continue;
      for (const target of labels.get(match[1].toLowerCase()) ?? []) {
        // An object's own definition and a field's own file aren't mentions.
        if (new RegExp(`objects/${escapeRegExp(target.object)}/(${escapeRegExp(target.object)}\\.object-meta\\.xml|fields/${escapeRegExp(target.field ?? '\u0000')}\\.field-meta\\.xml)$`, 'i').test(file.path)) continue;
        const mention: SalesforceReference = { file: fileId(file), line: lineAt(match.index ?? 0), kind: place ? kindOfFolder(place.folder) : 'other', component, how: `"${match[1]}"` };
        if (target.field) (objects[target.object].fields[target.field].labelMentions ??= []).push(mention);
        else objects[target.object].labelMentions.push(mention);
      }
    }
  }
}

function kindOfFolder(folder: string): ReferenceKind {
  const kinds: Record<string, ReferenceKind> = {
    classes: 'apex', triggers: 'trigger', flows: 'flow', layouts: 'layout', flexipages: 'flexipage', quickActions: 'quickAction',
    pathAssistants: 'pathAssistant', workflows: 'workflow', assignmentRules: 'assignmentRule', autoResponseRules: 'assignmentRule',
    escalationRules: 'assignmentRule', duplicateRules: 'duplicateRule', matchingRules: 'duplicateRule', sharingRules: 'sharingRule',
    reports: 'report', reportTypes: 'reportType', email: 'emailTemplate', lwc: 'lightningComponent', aura: 'lightningComponent',
    pages: 'visualforce', components: 'visualforce', tabs: 'tab',
  };
  return kinds[folder] ?? 'other';
}
