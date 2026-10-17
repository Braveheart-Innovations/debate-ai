/**
 * A Salesforce workspace's data model, read from its metadata: what
 * `salesforce_metadata_audit(operation="data_model")` writes as a diagram file.
 * App-owned, like the simulator: one tested reader instead of XML parsing the
 * agent writes per session.
 *
 *  - Objects: `objects/<Object>/<Object>.object-meta.xml` (source format) or
 *    `objects/<Object>.object` (metadata format, with its fields inline). Each
 *    carries its sharing models and record types
 *    (`objects/<Object>/recordTypes/<Type>.recordType-meta.xml`, or the
 *    `<recordTypes>` of a `.object` file).
 *  - Fields: `objects/<Object>/fields/<Field>.field-meta.xml`, or the `<fields>`
 *    of a `.object` file. The type is written with its size (`Text(80)`,
 *    `Number(18,2)`, `Formula(Currency)`), plus required, unique, external ID,
 *    picklist values and the description. A custom object's Name field comes
 *    from its `<nameField>`. A picklist's values can come from a value set:
 *    the global one it names (`globalValueSets/`), or for a standard picklist
 *    the standard one (`standardValueSets/LeadStatus` for `Lead.Status`).
 *  - Relationships: every Lookup, MasterDetail and Hierarchy field. An object a
 *    field points at that isn't in the model is added without fields, so both
 *    ends show: `platform` for a standard object, else the pointing field's file.
 *  - Sources: each object and field names the file it came from (the upload
 *    path, or `<zip>#<entry>`). A standard object with no object file is
 *    `platform`; its standard fields aren't in metadata at all.
 *
 * Owned first: without a list of objects it takes the org's own custom objects
 * and the standard objects the org added fields to. Objects from installed
 * packages (a namespace that isn't the workspace's) appear only where the
 * org's objects point at them, collapsed; package fields on the org's objects
 * are counted (`packageFieldCount`), not drawn.
 */
import { XMLParser } from 'fast-xml-parser';
import type {
  DataModelDiagram,
  DataModelEntity,
  DataModelField,
  DataModelRecordType,
  DataModelRelationship,
} from '../contract/services/analyze/diagrams/diagramFile';
import { relationshipTargets } from '../contract/services/salesforce/salesforceRelationships';
import { salesforceNamespaceOf, workspaceNamespace, type SalesforceSourceFile } from './SalesforceMetadataService';

export type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ['fields', 'referenceTo', 'value', 'recordTypes', 'customValue', 'standardValue'].includes(name),
});


/** An XML value as trimmed text, or undefined when it's empty or not text. */
export function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

export function flag(value: unknown): boolean {
  return text(value)?.toLowerCase() === 'true';
}

export function node(value: unknown): XmlNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as XmlNode : undefined;
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

/** A standard object: an API name without a `__` suffix (`Account`, not `Center__c` or `ns__Thing__c`). */
export function isStandardObject(apiName: string): boolean {
  return !/__[a-z]+$/i.test(apiName);
}

/** Included without a list: custom objects and standard ones (not `__mdt`, `__e`, `__x`…). */
function includedByDefault(apiName: string): boolean {
  return isStandardObject(apiName) || /__c$/i.test(apiName);
}

/** Where a file came from, as a diagram `source`: the upload path, or `<zip>#<entry>`. */
export function sourceFileRef(file: SalesforceSourceFile): string {
  const source = file.sourcePath ?? `/uploads/${file.path}`;
  if (source.replace(/^\/uploads\//, '') === file.path) return source;
  return `${source}#${file.path}`;
}

/** A field's type as Salesforce shows it, with its size: Text(80), Number(18,2), Formula(Currency)… */
export function describeFieldType(field: XmlNode): string | undefined {
  const type = text(field.type);
  if (field.formula !== undefined) return `Formula(${type ?? 'Text'})`;
  if (!type) return undefined;
  const length = text(field.length);
  const precision = text(field.precision);
  const scale = text(field.scale) ?? '0';
  if ((type === 'Text' || type === 'EncryptedText' || type === 'LongTextArea' || type === 'Html') && length) return `${type}(${length})`;
  if ((type === 'Number' || type === 'Currency' || type === 'Percent') && precision) return `${type}(${precision},${scale})`;
  return type;
}

function picklistValues(field: XmlNode): string[] | undefined {
  const definition = node(node(field.valueSet)?.valueSetDefinition);
  const values = list(definition?.value).flatMap((entry) => {
    const name = text(node(entry)?.fullName);
    return name ? [name] : [];
  });
  return values.length > 0 ? values : undefined;
}

interface ParsedField {
  field: DataModelField;
  type?: string;
  referenceTo: string[];
  /** The global value set the field names (`<valueSet><valueSetName>`). */
  valueSetName?: string;
}

function parseField(xml: XmlNode, fallbackName: string, source: string | undefined): ParsedField {
  const name = text(xml.fullName)?.split('.').pop() ?? fallbackName;
  const type = text(xml.type);
  const values = picklistValues(xml);
  const label = text(xml.label);
  const description = text(xml.description) ?? text(xml.inlineHelpText);
  const field: DataModelField = {
    name,
    ...(label ? { label } : {}),
    ...(describeFieldType(xml) ? { type: describeFieldType(xml) } : {}),
    ...(description ? { description } : {}),
    ...(values ? { values } : {}),
    // A master-detail field is always required; its XML doesn't say so.
    ...(flag(xml.required) || type === 'MasterDetail' ? { required: true } : {}),
    ...(flag(xml.unique) ? { unique: true } : {}),
    ...(flag(xml.externalId) ? { externalId: true } : {}),
    ...(source ? { source } : {}),
  };
  const valueSetName = text(node(xml.valueSet)?.valueSetName);
  return {
    field,
    type,
    referenceTo: list(xml.referenceTo).flatMap((entry) => (text(entry) ? [text(entry)!] : [])),
    ...(valueSetName ? { valueSetName } : {}),
  };
}

function parseRecordType(xml: XmlNode, fallbackName: string, source: string | undefined): DataModelRecordType {
  const label = text(xml.label);
  const description = text(xml.description);
  return {
    name: text(xml.fullName)?.split('.').pop() ?? fallbackName,
    ...(label ? { label } : {}),
    ...(xml.active !== undefined ? { active: flag(xml.active) } : {}),
    ...(description ? { description } : {}),
    ...(source ? { source } : {}),
  };
}

/** A custom object's Name field, from its `<nameField>`. */
function nameField(objectXml: XmlNode): DataModelField | null {
  const xml = node(objectXml.nameField);
  if (!xml) return null;
  const type = text(xml.type) === 'AutoNumber' ? 'AutoNumber' : 'Text(80)';
  const label = text(xml.label);
  return { name: 'Name', ...(label ? { label } : {}), type, required: true };
}

interface ObjectMetadata {
  apiName: string;
  /** The object's own file (`.object-meta.xml` or `.object`), when the upload has one. */
  file?: SalesforceSourceFile;
  xml?: XmlNode;
  fields: ParsedField[];
  recordTypes: DataModelRecordType[];
}

interface ValueSet {
  values: string[];
  source: string;
}

function parseXml(file: SalesforceSourceFile): XmlNode | undefined {
  try {
    return node(parser.parse(file.content));
  } catch {
    return undefined;
  }
}

/** Every object the upload describes, with its fields and record types, keyed by API name. */
export function readSalesforceObjects(sourceFiles: SalesforceSourceFile[]): Map<string, ObjectMetadata> {
  const objects = new Map<string, ObjectMetadata>();
  const objectFor = (apiName: string): ObjectMetadata => {
    const existing = objects.get(apiName);
    if (existing) return existing;
    const created: ObjectMetadata = { apiName, fields: [], recordTypes: [] };
    objects.set(apiName, created);
    return created;
  };

  for (const file of sourceFiles) {
    const path = file.path.replace(/\\/g, '/');
    const fieldMatch = path.match(/(?:^|\/)objects\/([^/]+)\/fields\/([^/]+)\.field-meta\.xml$/i);
    if (fieldMatch) {
      const xml = node(parseXml(file)?.CustomField);
      if (xml) objectFor(fieldMatch[1]).fields.push(parseField(xml, fieldMatch[2], sourceFileRef(file)));
      continue;
    }
    const recordTypeMatch = path.match(/(?:^|\/)objects\/([^/]+)\/recordTypes\/([^/]+)\.recordType-meta\.xml$/i);
    if (recordTypeMatch) {
      const xml = node(parseXml(file)?.RecordType);
      if (xml) objectFor(recordTypeMatch[1]).recordTypes.push(parseRecordType(xml, recordTypeMatch[2], sourceFileRef(file)));
      continue;
    }
    const sourceFormat = path.match(/(?:^|\/)objects\/([^/]+)\/([^/]+)\.object-meta\.xml$/i);
    const metadataFormat = path.match(/(?:^|\/)objects\/([^/]+)\.object$/i);
    const apiName = sourceFormat && sourceFormat[1].toLowerCase() === sourceFormat[2].toLowerCase() ? sourceFormat[1] : metadataFormat?.[1];
    if (!apiName) continue;
    const xml = node(parseXml(file)?.CustomObject);
    if (!xml) continue;
    const object = objectFor(apiName);
    object.file = file;
    object.xml = xml;
    // The metadata format keeps the fields and record types inside the object file.
    for (const entry of list(xml.fields)) {
      const fieldXml = node(entry);
      if (fieldXml) object.fields.push(parseField(fieldXml, text(fieldXml.fullName) ?? 'field', undefined));
    }
    for (const entry of list(xml.recordTypes)) {
      const recordTypeXml = node(entry);
      if (recordTypeXml) object.recordTypes.push(parseRecordType(recordTypeXml, text(recordTypeXml.fullName) ?? 'recordType', undefined));
    }
  }
  return objects;
}

/** The global and standard value sets in the upload, by name (case kept as written). */
function readValueSets(sourceFiles: SalesforceSourceFile[]): { global: Map<string, ValueSet>; standard: Map<string, ValueSet> } {
  const global = new Map<string, ValueSet>();
  const standard = new Map<string, ValueSet>();
  for (const file of sourceFiles) {
    const path = file.path.replace(/\\/g, '/');
    const globalMatch = path.match(/(?:^|\/)globalValueSets\/([^/]+?)\.globalValueSet(?:-meta\.xml)?$/i);
    const standardMatch = path.match(/(?:^|\/)standardValueSets\/([^/]+?)\.standardValueSet(?:-meta\.xml)?$/i);
    if (!globalMatch && !standardMatch) continue;
    const parsed = parseXml(file);
    const xml = node(globalMatch ? parsed?.GlobalValueSet : parsed?.StandardValueSet);
    if (!xml) continue;
    const values = list(globalMatch ? xml.customValue : xml.standardValue).flatMap((entry) => {
      const name = text(node(entry)?.fullName);
      return name ? [name] : [];
    });
    if (values.length === 0) continue;
    (globalMatch ? global : standard).set((globalMatch ?? standardMatch)![1], { values, source: sourceFileRef(file) });
  }
  return { global, standard };
}

/** Standard picklists whose value set isn't named `<Object><Field>` or `<Field>`. */
const STANDARD_VALUE_SET_EXCEPTIONS: Record<string, string> = {
  'Opportunity.StageName': 'OpportunityStage',
  'OpportunityContactRole.Role': 'ContactRole',
  'AccountContactRole.Role': 'AccountContactRole',
  'CaseContactRole.Role': 'CaseContactRole',
  'ContractContactRole.Role': 'ContractContactRole',
  'AccountTeamMember.TeamMemberRole': 'SalesTeamRole',
  'OpportunityTeamMember.TeamMemberRole': 'SalesTeamRole',
};

/** The standard value set a standard picklist reads, when the upload has it: `LeadStatus` for `Lead.Status`, `LeadSource` for `Contact.LeadSource`. */
function standardValueSetFor(objectName: string, fieldName: string, standard: Map<string, ValueSet>): string | undefined {
  if (!isStandardObject(objectName) || /__c$/i.test(fieldName)) return undefined;
  const byLowerName = new Map([...standard.keys()].map((name) => [name.toLowerCase(), name]));
  const candidates = [STANDARD_VALUE_SET_EXCEPTIONS[`${objectName}.${fieldName}`], `${objectName}${fieldName}`, fieldName];
  for (const candidate of candidates) {
    const name = candidate ? byLowerName.get(candidate.toLowerCase()) : undefined;
    if (name) return name;
  }
  return undefined;
}

/** A field with its value set's values, when it takes them from one. */
function withValueSet(
  objectName: string,
  parsed: ParsedField,
  valueSets: ReturnType<typeof readValueSets>,
): DataModelField {
  if (parsed.field.values || !/picklist/i.test(parsed.type ?? '')) return parsed.field;
  if (parsed.valueSetName) {
    const set = valueSets.global.get(parsed.valueSetName);
    return { ...parsed.field, valueSet: parsed.valueSetName, ...(set ? { values: set.values } : {}) };
  }
  const name = standardValueSetFor(objectName, parsed.field.name, valueSets.standard);
  return name ? { ...parsed.field, valueSet: name, values: valueSets.standard.get(name)!.values } : parsed.field;
}

export interface SalesforceDataModelResult {
  diagram: DataModelDiagram;
  /** Objects asked for that the upload doesn't describe. */
  notFound: string[];
  /** Objects added without fields because a field points at them. */
  referenced: string[];
  /** Of those, the ones from installed packages (drawn collapsed). */
  packageObjects: string[];
  /** Fields from installed packages left out of the org's objects. */
  packageFieldCount: number;
}

/** The data model of these objects (or the org's own objects), as a diagram file's data model. */
export function buildSalesforceDataModel(
  sourceFiles: SalesforceSourceFile[],
  options: { objects?: string[]; uploadName?: string } = {},
): SalesforceDataModelResult {
  const all = readSalesforceObjects(sourceFiles);
  const valueSets = readValueSets(sourceFiles);
  const own = workspaceNamespace(sourceFiles)?.toLowerCase();
  /** The installed package a name comes from: a namespace that isn't the workspace's own. */
  const packageOf = (name: string): string | undefined => {
    const namespace = salesforceNamespaceOf(name);
    return namespace && namespace.toLowerCase() !== own ? namespace : undefined;
  };
  const ownField = (parsed: ParsedField) => /__c$/i.test(parsed.field.name) && !packageOf(parsed.field.name);

  const byLowerName = new Map([...all.keys()].map((name) => [name.toLowerCase(), name]));
  // An empty list is no list: the org's own objects. ["*"] is every object in the workspace.
  const listed = options.objects?.map((name) => name.trim()).filter(Boolean);
  const everything = Boolean(listed?.includes('*'));
  const wanted = !everything && listed && listed.length > 0 ? listed : undefined;
  const notFound = (wanted ?? []).filter((name) => !byLowerName.has(name.toLowerCase()));
  const chosen = everything
    ? [...all.keys()].sort()
    : wanted
    ? [...new Set(wanted.flatMap((name) => byLowerName.get(name.toLowerCase()) ?? []))]
    : [...all.keys()].filter((name) => {
      if (!includedByDefault(name) || packageOf(name)) return false;
      // A standard object is drawn when the org added fields to it.
      return !isStandardObject(name) || all.get(name)!.fields.some(ownField);
    }).sort();

  const entities: DataModelEntity[] = [];
  const relationships: DataModelRelationship[] = [];
  const present = new Set(chosen);
  const referenced: DataModelEntity[] = [];
  let packageFieldCount = 0;

  /** What every box says about its object, drawn or collapsed: label, package, sharing. */
  const objectDetails = (apiName: string, object: ObjectMetadata | undefined) => {
    const label = object?.xml ? text(object.xml.label) : undefined;
    const namespace = packageOf(apiName);
    const sharingModel = object?.xml ? text(object.xml.sharingModel) : undefined;
    const externalSharingModel = object?.xml ? text(object.xml.externalSharingModel) : undefined;
    return {
      ...(label ? { label } : {}),
      ...(namespace ? { namespace, managed: true } : {}),
      ...(sharingModel ? { sharingModel } : {}),
      ...(externalSharingModel ? { externalSharingModel } : {}),
    };
  };

  for (const apiName of chosen) {
    const object = all.get(apiName)!;
    const objectSource = object.file ? sourceFileRef(object.file) : isStandardObject(apiName) ? 'platform' : undefined;
    // A package object asked for by name shows all its fields; the org's objects leave package fields out.
    const drawn = packageOf(apiName) ? object.fields : object.fields.filter((parsed) => !packageOf(parsed.field.name));
    const leftOut = object.fields.length - drawn.length;
    packageFieldCount += leftOut;
    const name = object.xml ? nameField(object.xml) : null;
    const fields = [
      ...(name && !drawn.some((parsed) => parsed.field.name === 'Name') ? [name] : []),
      ...drawn.map((parsed) => withValueSet(apiName, parsed, valueSets)),
    ];
    const description = object.xml ? text(object.xml.description) : undefined;
    const recordTypes = [...object.recordTypes].sort((a, b) => a.name.localeCompare(b.name));
    entities.push({
      id: apiName,
      name: apiName,
      ...objectDetails(apiName, object),
      ...(description ? { description } : {}),
      ...(objectSource ? { source: objectSource } : {}),
      fields,
      ...(recordTypes.length > 0 ? { recordTypes } : {}),
      ...(leftOut > 0 ? { packageFieldCount: leftOut } : {}),
    });

    for (const parsed of drawn) {
      // The platform's own lookups (Contact.AccountId) name no target: the shared rule reads them by name.
      const targets = relationshipTargets(apiName, { name: parsed.field.name, type: parsed.type, referenceTo: parsed.referenceTo }, (name) => byLowerName.get(name.toLowerCase()));
      for (const target of targets) {
        const targetName = byLowerName.get(target.toLowerCase()) ?? target;
        if (!present.has(targetName)) {
          present.add(targetName);
          const targetObject = all.get(targetName);
          const source = isStandardObject(targetName) ? 'platform' : targetObject?.file ? sourceFileRef(targetObject.file) : parsed.field.source ?? objectSource;
          referenced.push({ id: targetName, name: targetName, ...objectDetails(targetName, targetObject), ...(source ? { source } : {}), fields: [] });
        }
        const masterDetail = parsed.type === 'MasterDetail';
        relationships.push({
          id: targets.length > 1 ? `${apiName}.${parsed.field.name}:${targetName}` : `${apiName}.${parsed.field.name}`,
          kind: masterDetail ? 'master_detail' : 'lookup',
          from: apiName,
          to: targetName,
          field: parsed.field.name,
          cardinality: { from: 'zero_or_more', to: masterDetail || parsed.field.required ? 'exactly_one' : 'zero_or_one' },
        });
      }
    }
  }

  const count = entities.length;
  const packageObjects = referenced.filter((entity) => entity.managed).map((entity) => entity.id);
  const summary = [
    `${count} ${count === 1 ? 'object' : 'objects'} with their fields and relationships, read from ${options.uploadName ? options.uploadName : 'the uploaded metadata'}.`,
    packageObjects.length > 0 ? `Objects from installed packages appear only where these point at them, collapsed (${packageObjects.length}).` : '',
    packageFieldCount > 0 ? `${packageFieldCount} ${packageFieldCount === 1 ? 'field' : 'fields'} from installed packages are counted on their objects, not drawn.` : '',
  ].filter(Boolean).join(' ');
  const diagram: DataModelDiagram = {
    version: 1,
    kind: 'data_model',
    platform: 'salesforce',
    title: 'Salesforce data model',
    summary,
    entities: [...entities, ...referenced],
    relationships,
  };
  return { diagram, notFound, referenced: referenced.map((entity) => entity.id), packageObjects, packageFieldCount };
}
