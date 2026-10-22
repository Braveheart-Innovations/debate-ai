/**
 * Every Flow the org owns as one row of facts, read from its metadata: what
 * `salesforce_metadata_audit(operation="flows")` writes as a table. The same
 * reader as the Flow diagram (drawFlow): what can run, fault paths, record
 * operations inside a loop, the start's trigger and entry conditions. In the
 * Flow redesign live tests (2026-10-22) the model rebuilt these facts itself,
 * a parser at a time, over a dozen rounds.
 *
 * Fields written are the ones the flow sets on a record that a create or
 * update saves: `$Record.Status` for the record that triggered it (a
 * before-save assignment, or an update of `$Record`), `Opportunity.StageName`
 * for other records (the create or update's own fields, or a record variable's
 * fields assigned before the variable is saved).
 */
import { FAULT_PATH_ELEMENTS, type FlowNode } from '../contract/services/analyze/diagrams/diagramFile';
import { list, node, text } from './salesforceDataModel';
import { drawFlow, flowEntryConditions, parseSalesforceFlow, salesforceFlowFiles, type ParsedSalesforceFlow } from './salesforceFlowDiagram';
import { salesforceNamespaceOf, workspaceNamespace, type SalesforceSourceFile } from './SalesforceMetadataService';

export interface SalesforceFlowRow {
  name: string;
  label: string;
  status: string;
  processType: string;
  triggerType: string;
  object: string;
  recordTriggerType: string;
  triggerOrder: number | null;
  entryCriteria: string;
  /** Elements that can run (the start reaches them). */
  elements: number;
  lookups: number;
  creates: number;
  updates: number;
  deletes: number;
  recordOperationsInLoops: number;
  /** Elements that can take a fault path (none in a before-save flow). */
  faultCapable: number;
  withFaultPath: number;
  subflows: string[];
  apexActions: string[];
  /** Other actions, as type:name (emailAlert:Lead.Welcome). */
  otherActions: string[];
  eventsPublished: string[];
  /** Scheduled paths by label; an asynchronous path is "async: <label>". */
  scheduledPaths: string[];
  fieldsWritten: string[];
  /** An after-save flow that updates the record that triggered it. */
  updatesOwnRecord: boolean;
  path: string;
}

export const FLOW_TABLE_COLUMNS: ReadonlyArray<keyof SalesforceFlowRow> = [
  'name', 'label', 'status', 'processType', 'triggerType', 'object', 'recordTriggerType', 'triggerOrder', 'entryCriteria',
  'elements', 'lookups', 'creates', 'updates', 'deletes', 'recordOperationsInLoops', 'faultCapable', 'withFaultPath',
  'subflows', 'apexActions', 'otherActions', 'eventsPublished', 'scheduledPaths', 'fieldsWritten', 'updatesOwnRecord', 'path',
];

export interface SalesforceFlowTable {
  rows: SalesforceFlowRow[];
  /** Flow files the org owns that couldn't be read as XML. */
  unreadable: string[];
}

/** The flow's record variables (single or collection) and their object: `varOpp` → Opportunity. */
function recordVariables(content: string): Map<string, string> {
  const variables = new Map<string, string>();
  for (const match of content.matchAll(/<variables>([\s\S]*?)<\/variables>/g)) {
    const name = match[1].match(/<name>([^<]+)<\/name>/)?.[1]?.trim();
    const object = match[1].match(/<objectType>([^<]+)<\/objectType>/)?.[1]?.trim();
    if (name && object) variables.set(name, object);
  }
  return variables;
}

function scheduledPathLabels(flow: ParsedSalesforceFlow): string[] {
  return list(flow.start?.scheduledPaths).flatMap((entry) => {
    const path = node(entry);
    if (!path) return [];
    if (text(path.pathType) === 'AsyncAfterCommit') return [`async: ${text(path.label) ?? text(path.name) ?? 'Run asynchronously'}`];
    const offset = [text(path.offsetNumber), text(path.offsetUnit)?.toLowerCase(), text(path.timeSource) ? `from ${text(path.timeSource)}` : ''].filter(Boolean).join(' ');
    return [[text(path.label) ?? text(path.name), offset ? `(${offset})` : ''].filter(Boolean).join(' ') || 'Scheduled path'];
  });
}

const RECORD_SAVES = new Set(['recordCreates', 'recordUpdates']);

function isOwnRecordUpdate(step: FlowNode, flow: ParsedSalesforceFlow): boolean {
  const facts = step.element;
  if (!facts) return false;
  if (facts.inputRecord === '$Record') return true;
  return Boolean(flow.triggerObject && facts.object === flow.triggerObject
    && facts.filters?.some((condition) => condition.field === 'Id' && condition.operator === 'EqualTo' && /^\$Record\.Id$/i.test(condition.value ?? '')));
}

export function salesforceFlowRow(flow: ParsedSalesforceFlow): SalesforceFlowRow {
  const drawn = drawFlow(flow, '', '');
  const steps = drawn.nodes.filter((entry) => entry.type === 'step' || (entry.type === 'decision' && entry.elementType !== 'scheduledPaths'));
  const ofType = (tag: string) => steps.filter((entry) => entry.elementType === tag);
  const beforeSave = flow.triggerType === 'RecordBeforeSave';
  const faultCapable = beforeSave ? [] : steps.filter((entry) => FAULT_PATH_ELEMENTS.has(entry.elementType ?? ''));
  const hasFault = (entry: FlowNode) => drawn.flows.some((connection) => connection.from === entry.id && connection.fault);

  const variables = recordVariables(flow.file.content);
  const written = new Set<string>();
  let updatesRecord = false;
  const savedVariableObjects = new Set<string>();
  for (const step of steps.filter((entry) => RECORD_SAVES.has(entry.elementType ?? ''))) {
    const facts = step.element;
    if (!facts) continue;
    const own = step.elementType === 'recordUpdates' && isOwnRecordUpdate(step, flow);
    if (own) updatesRecord = true;
    for (const assignment of facts.assignments ?? []) {
      if (own) written.add(`$Record.${assignment.field}`);
      else if (facts.object) written.add(`${facts.object}.${assignment.field}`);
    }
    if (facts.inputRecord && facts.inputRecord !== '$Record' && variables.has(facts.inputRecord)) {
      savedVariableObjects.add(variables.get(facts.inputRecord)!);
    }
  }
  for (const step of ofType('assignments')) {
    for (const assignment of step.element?.assignments ?? []) {
      const [variable, field] = assignment.field.split('.');
      if (!field) continue;
      if (variable === '$Record') {
        if (beforeSave || updatesRecord) written.add(`$Record.${field}`);
      } else if (variables.has(variable) && savedVariableObjects.has(variables.get(variable)!)) {
        written.add(`${variables.get(variable)}.${field}`);
      }
    }
  }

  const actions = ofType('actionCalls').flatMap((entry) => (entry.element?.action ? [entry.element.action] : []));
  return {
    name: flow.apiName,
    label: flow.label,
    status: flow.status ?? '',
    processType: flow.processType ?? '',
    triggerType: flow.triggerType ?? '',
    object: flow.triggerObject ?? '',
    recordTriggerType: flow.recordTriggerType ?? '',
    triggerOrder: flow.triggerOrder ?? null,
    entryCriteria: flowEntryConditions(flow),
    elements: steps.length,
    lookups: ofType('recordLookups').length,
    creates: ofType('recordCreates').length,
    updates: ofType('recordUpdates').length,
    deletes: ofType('recordDeletes').length,
    recordOperationsInLoops: steps.filter((entry) => entry.issues?.some((issue) => issue.startsWith('In a loop'))).length,
    faultCapable: faultCapable.length,
    withFaultPath: faultCapable.filter(hasFault).length,
    subflows: [...new Set(ofType('subflows').flatMap((entry) => (entry.element?.flowName ? [entry.element.flowName] : [])))],
    apexActions: [...new Set([
      ...actions.filter((action) => action.type === 'apex').map((action) => action.name),
      ...ofType('apexPluginCalls').flatMap((entry) => (entry.element?.action ? [entry.element.action.name] : [])),
    ])],
    otherActions: [...new Set(actions.filter((action) => action.type !== 'apex').map((action) => (action.type ? `${action.type}:${action.name}` : action.name)))],
    eventsPublished: [...new Set(ofType('recordCreates').flatMap((entry) => (entry.element?.object && /__e$/i.test(entry.element.object) ? [entry.element.object] : [])))],
    scheduledPaths: scheduledPathLabels(flow),
    fieldsWritten: [...written].sort(),
    updatesOwnRecord: flow.triggerType === 'RecordAfterSave' && updatesRecord,
    path: flow.file.path.replace(/\\/g, '/'),
  };
}

/** One row per Flow the org owns (installed packages' flows are left out), by API name. */
export function buildSalesforceFlowTable(sourceFiles: SalesforceSourceFile[]): SalesforceFlowTable {
  const own = workspaceNamespace(sourceFiles)?.toLowerCase();
  const rows: SalesforceFlowRow[] = [];
  const unreadable: string[] = [];
  for (const [name, file] of salesforceFlowFiles(sourceFiles)) {
    const namespace = salesforceNamespaceOf(name);
    if (namespace && namespace.toLowerCase() !== own) continue;
    const flow = parseSalesforceFlow(name, file);
    if (flow) rows.push(salesforceFlowRow(flow));
    else unreadable.push(name);
  }
  return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), unreadable: unreadable.sort() };
}

function csvCell(value: SalesforceFlowRow[keyof SalesforceFlowRow]): string {
  const cell = Array.isArray(value) ? value.join('; ') : value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** The table as CSV: a header row, lists joined by "; ". */
export function salesforceFlowTableCsv(rows: SalesforceFlowRow[]): string {
  return `${[FLOW_TABLE_COLUMNS.join(','), ...rows.map((row) => FLOW_TABLE_COLUMNS.map((column) => csvCell(row[column])).join(','))].join('\n')}\n`;
}

/** What starts a record-triggered flow, as a phase: before-save, after-save, before-delete, after-delete. */
function recordPhase(row: SalesforceFlowRow): string | null {
  if (row.triggerType === 'RecordBeforeSave') return 'before-save';
  if (row.triggerType === 'RecordBeforeDelete') return 'before-delete';
  if (row.triggerType === 'RecordAfterSave') return row.recordTriggerType === 'Delete' ? 'after-delete' : 'after-save';
  return null;
}

const PHASE_ORDER = ['before-save', 'after-save', 'before-delete', 'after-delete'];

function counted(counts: Map<string, number>, order?: string[]): string {
  const keys = [...counts.keys()].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : 0) || (counts.get(b)! - counts.get(a)!) || a.localeCompare(b));
  return keys.map((key) => `${key} ${counts.get(key)}`).join(', ');
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** The table in counts: active flows by object and phase, the rest by kind, then the totals the rows add up to. */
export function summarizeSalesforceFlowTable(table: SalesforceFlowTable): string[] {
  const { rows } = table;
  const active = rows.filter((row) => row.status === 'Active');
  const lines = [`Flows the org owns: ${rows.length}, ${active.length} active.`];

  const byObject = new Map<string, Map<string, number>>();
  const other = new Map<string, number>();
  const events = new Map<string, number>();
  for (const row of active) {
    const phase = recordPhase(row);
    if (phase) {
      const key = row.object || '(no object)';
      if (!byObject.has(key)) byObject.set(key, new Map());
      bump(byObject.get(key)!, phase);
    } else if (row.triggerType === 'PlatformEvent') {
      bump(events, row.object || '(no event)');
    } else if (row.triggerType === 'Scheduled') {
      bump(other, 'scheduled');
    } else if (row.processType === 'Flow') {
      bump(other, 'screen');
    } else if (row.processType === 'AutoLaunchedFlow') {
      bump(other, 'autolaunched (started by Apex, a subflow call or another flow)');
    } else if (row.processType === 'Workflow') {
      bump(other, 'Process Builder');
    } else {
      bump(other, row.processType || 'no process type');
    }
  }
  if (byObject.size > 0) {
    lines.push('Active record-triggered flows by object:');
    const total = (counts: Map<string, number>) => [...counts.values()].reduce((sum, count) => sum + count, 0);
    for (const [object, counts] of [...byObject.entries()].sort((a, b) => total(b[1]) - total(a[1]) || a[0].localeCompare(b[0]))) {
      lines.push(`- ${object}: ${counted(counts, PHASE_ORDER)}`);
    }
  }
  const eventCount = [...events.values()].reduce((sum, count) => sum + count, 0);
  const others = [
    eventCount > 0 ? `platform event ${eventCount} (${counted(events)})` : '',
    counted(other),
  ].filter(Boolean).join(', ');
  if (others) lines.push(`Other active flows: ${others}.`);
  const inactive = new Map<string, number>();
  for (const row of rows.filter((entry) => entry.status !== 'Active')) bump(inactive, row.status || 'no status');
  if (inactive.size > 0) lines.push(`Not active: ${rows.length - active.length} (${counted(inactive)}).`);

  const sum = (key: 'faultCapable' | 'withFaultPath' | 'recordOperationsInLoops') => active.reduce((total, row) => total + row[key], 0);
  lines.push(`Across the active flows: ${sum('faultCapable')} elements that can take a fault path, ${sum('withFaultPath')} with one (before-save flows have none); ${sum('recordOperationsInLoops')} record operations inside a loop; ${active.filter((row) => row.updatesOwnRecord).length} after-save flows update the record that triggered them.`);
  if (table.unreadable.length > 0) lines.push(`Not read (the XML didn't parse): ${table.unreadable.join(', ')}.`);
  return lines;
}
