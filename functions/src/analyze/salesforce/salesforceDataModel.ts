/**
 * A Salesforce workspace's data model, read from its metadata: what
 * `salesforce_metadata_audit(operation="data_model")` writes as a diagram file.
 * App-owned, like the simulator: one tested reader instead of XML parsing the
 * agent writes per session.
 *
 *  - Objects: `objects/<Object>/<Object>.object-meta.xml` (source format) or
 *    `objects/<Object>.object` (metadata format, with its fields inline).
 *  - Fields: `objects/<Object>/fields/<Field>.field-meta.xml`, or the `<fields>`
 *    of a `.object` file. The type is written with its size (`Text(80)`,
 *    `Number(18,2)`, `Formula(Currency)`), plus required, unique, external ID,
 *    picklist values and the description. A custom object's Name field comes
 *    from its `<nameField>`.
 *  - Relationships: every Lookup, MasterDetail and Hierarchy field. An object a
 *    field points at that isn't in the model is added without fields, so both
 *    ends show: `platform` for a standard object, else the pointing field's file.
 *  - Sources: each object and field names the file it came from (the upload
 *    path, or `<zip>#<entry>`). A standard object with no object file is
 *    `platform`; its standard fields aren't in metadata at all.
 *
 * Without a list of objects it takes every custom object (`__c`) and every
 * standard object the metadata has fields for.
 */
import { XMLParser } from 'fast-xml-parser';
import type {
  DataModelDiagram,
  DataModelEntity,
  DataModelField,
  DataModelRelationship,
} from '../contract/services/analyze/diagrams/diagramFile';
import type { SalesforceSourceFile } from './SalesforceMetadataService';

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'fields' || name === 'referenceTo' || name === 'value',
});

const RELATIONSHIP_TYPES = new Set(['Lookup', 'MasterDetail', 'Hierarchy', 'ExternalLookup', 'IndirectLookup']);

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function flag(value: unknown): boolean {
  return text(value)?.toLowerCase() === 'true';
}

function node(value: unknown): XmlNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as XmlNode : undefined;
}

function list(value: unknown): unknown[] {
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
  return { field, type, referenceTo: list(xml.referenceTo).flatMap((entry) => (text(entry) ? [text(entry)!] : [])) };
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
}

function parseXml(file: SalesforceSourceFile): XmlNode | undefined {
  try {
    return node(parser.parse(file.content));
  } catch {
    return undefined;
  }
}

/** Every object the upload describes, with its fields, keyed by API name. */
export function readSalesforceObjects(sourceFiles: SalesforceSourceFile[]): Map<string, ObjectMetadata> {
  const objects = new Map<string, ObjectMetadata>();
  const objectFor = (apiName: string): ObjectMetadata => {
    const existing = objects.get(apiName);
    if (existing) return existing;
    const created: ObjectMetadata = { apiName, fields: [] };
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
    const sourceFormat = path.match(/(?:^|\/)objects\/([^/]+)\/([^/]+)\.object-meta\.xml$/i);
    const metadataFormat = path.match(/(?:^|\/)objects\/([^/]+)\.object$/i);
    const apiName = sourceFormat && sourceFormat[1].toLowerCase() === sourceFormat[2].toLowerCase() ? sourceFormat[1] : metadataFormat?.[1];
    if (!apiName) continue;
    const xml = node(parseXml(file)?.CustomObject);
    if (!xml) continue;
    const object = objectFor(apiName);
    object.file = file;
    object.xml = xml;
    // The metadata format keeps the fields inside the object file.
    for (const entry of list(xml.fields)) {
      const fieldXml = node(entry);
      if (fieldXml) object.fields.push(parseField(fieldXml, text(fieldXml.fullName) ?? 'field', undefined));
    }
  }
  return objects;
}

export interface SalesforceDataModelResult {
  diagram: DataModelDiagram;
  /** Objects asked for that the upload doesn't describe. */
  notFound: string[];
  /** Objects added without fields because a field points at them. */
  referenced: string[];
}

/** The data model of these objects (or every custom and standard object), as a diagram file's data model. */
export function buildSalesforceDataModel(
  sourceFiles: SalesforceSourceFile[],
  options: { objects?: string[]; uploadName?: string } = {},
): SalesforceDataModelResult {
  const all = readSalesforceObjects(sourceFiles);
  const byLowerName = new Map([...all.keys()].map((name) => [name.toLowerCase(), name]));
  const wanted = options.objects?.map((name) => name.trim()).filter(Boolean);
  const notFound = (wanted ?? []).filter((name) => !byLowerName.has(name.toLowerCase()));
  const chosen = wanted
    ? [...new Set(wanted.flatMap((name) => byLowerName.get(name.toLowerCase()) ?? []))]
    : [...all.keys()].filter((name) => includedByDefault(name) && (all.get(name)!.fields.length > 0 || !isStandardObject(name))).sort();

  const entities: DataModelEntity[] = [];
  const relationships: DataModelRelationship[] = [];
  const present = new Set(chosen);
  const referenced: DataModelEntity[] = [];

  for (const apiName of chosen) {
    const object = all.get(apiName)!;
    const objectSource = object.file ? sourceFileRef(object.file) : isStandardObject(apiName) ? 'platform' : undefined;
    const name = object.xml ? nameField(object.xml) : null;
    const fields = [
      ...(name && !object.fields.some((parsed) => parsed.field.name === 'Name') ? [name] : []),
      ...object.fields.map((parsed) => parsed.field),
    ];
    const label = object.xml ? text(object.xml.label) : undefined;
    const description = object.xml ? text(object.xml.description) : undefined;
    entities.push({
      id: apiName,
      name: apiName,
      ...(label ? { label } : {}),
      ...(description ? { description } : {}),
      ...(objectSource ? { source: objectSource } : {}),
      fields,
    });

    for (const parsed of object.fields) {
      if (!parsed.type || !RELATIONSHIP_TYPES.has(parsed.type)) continue;
      // A hierarchy field points at its own object (User's Manager).
      const targets = parsed.type === 'Hierarchy' && parsed.referenceTo.length === 0 ? [apiName] : parsed.referenceTo;
      for (const target of targets) {
        const targetName = byLowerName.get(target.toLowerCase()) ?? target;
        if (!present.has(targetName)) {
          present.add(targetName);
          const targetObject = all.get(targetName);
          const source = isStandardObject(targetName) ? 'platform' : targetObject?.file ? sourceFileRef(targetObject.file) : parsed.field.source ?? objectSource;
          const targetLabel = targetObject?.xml ? text(targetObject.xml.label) : undefined;
          referenced.push({ id: targetName, name: targetName, ...(targetLabel ? { label: targetLabel } : {}), ...(source ? { source } : {}), fields: [] });
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
  const diagram: DataModelDiagram = {
    version: 1,
    kind: 'data_model',
    platform: 'salesforce',
    title: 'Salesforce data model',
    summary: `${count} ${count === 1 ? 'object' : 'objects'} with their fields and relationships, read from ${options.uploadName ? options.uploadName : 'the uploaded metadata'}.`,
    entities: [...entities, ...referenced],
    relationships,
  };
  return { diagram, notFound, referenced: referenced.map((entity) => entity.id) };
}
