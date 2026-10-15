/**
 * What runs when a record of an object saves: Salesforce's documented order of
 * execution with the object's own automation in it, read from the metadata.
 * What `salesforce_metadata_audit(operation="save_order")` writes, one process
 * diagram per object (`platform: "salesforce"`).
 *
 * The stages follow the Apex Developer Guide's "Triggers and Order of
 * Execution" (Winter '27, API 68.0): system validation, before-save flows,
 * before triggers, validation rules, duplicate rules, the save, after
 * triggers, assignment and auto-response rules, workflow rules, escalation
 * rules, Process Builder, after-save flows, entitlement rules, roll-up
 * summaries, criteria-based sharing, the commit, then asynchronous paths.
 * Record-triggered flows run in trigger order: 1–1000 first, then the flows
 * without one (by activation date, which metadata doesn't carry), then
 * 1001–2000, ties by API name (Salesforce Help, "Define the Run Order of
 * Record-Triggered Flows for an Object").
 *
 * Each piece of automation is a step whose source is its file and whose label
 * says when it's create or update only. A stage the object has nothing in is
 * left out; the platform's own steps (validation, save, commit) stay. Package
 * triggers whose source is hidden can't be placed on an object: the result
 * names the ones whose name mentions it.
 */
import { XMLParser } from 'fast-xml-parser';
import type { Flow, FlowNode, ProcessFlowDiagram } from '../contract/services/analyze/diagrams/diagramFile';
import { flag, list, node, sourceFileRef, text, type XmlNode } from './salesforceDataModel';
import { flowEntryConditions, parseSalesforceFlow, salesforceFlowFiles, scheduledPaths, type ParsedSalesforceFlow } from './salesforceFlowDiagram';
import type { SalesforceSourceFile } from './SalesforceMetadataService';

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ['rules', 'actions', 'fieldUpdates', 'assignmentRule', 'autoResponseRule', 'escalationRule', 'ruleEntry', 'sharingCriteriaRules', 'processMetadataValues'].includes(name),
});

/** A save the automation runs on. */
type Saves = 'create' | 'update' | 'both';

interface Step {
  id: string;
  label: string;
  elementType?: string;
  description?: string;
  source: string;
  issues?: string[];
}

function parse(file: SalesforceSourceFile, root: string): XmlNode | undefined {
  try {
    return node(node(parser.parse(file.content))?.[root]);
  } catch {
    return undefined;
  }
}

function pathOf(file: SalesforceSourceFile): string {
  return file.path.replace(/\\/g, '/');
}

/** A label with the saves it runs on when that isn't both: "Set Final Source (create only)". */
function labelled(label: string, saves: Saves): string {
  return saves === 'both' ? label : `${label} (${saves} only)`;
}

function savesOfFlow(flow: ParsedSalesforceFlow): Saves | null {
  switch (flow.recordTriggerType) {
    case 'Create': return 'create';
    case 'Update': return 'update';
    case 'CreateAndUpdate': return 'both';
    default: return null;
  }
}

/**
 * Record-triggered flows in the order they run: trigger orders 1–1000, then
 * flows without one, then 1001–2000; ties (and the unordered group, as drawn)
 * by API name.
 */
export function orderRecordTriggeredFlows(flows: ParsedSalesforceFlow[]): ParsedSalesforceFlow[] {
  const band = (flow: ParsedSalesforceFlow) => (flow.triggerOrder === undefined ? 1 : flow.triggerOrder <= 1000 ? 0 : 2);
  return [...flows].sort((a, b) => band(a) - band(b)
    || (a.triggerOrder ?? 0) - (b.triggerOrder ?? 0)
    || a.apiName.localeCompare(b.apiName));
}

function flowStep(flow: ParsedSalesforceFlow, stage: string): Step | null {
  const saves = savesOfFlow(flow);
  if (!saves) return null;
  const parts = [
    `${stage}.`,
    flow.triggerOrder !== undefined
      ? `Trigger order ${flow.triggerOrder}.`
      : 'No trigger order: runs after orders 1–1000 and before 1001–2000, by activation date, which metadata doesn\'t record.',
    flowEntryConditions(flow),
    flow.description ?? '',
  ].filter(Boolean);
  return {
    id: `flow:${flow.apiName}`,
    label: labelled(flow.label, saves),
    elementType: 'flow',
    description: parts.join(' '),
    source: sourceFileRef(flow.file),
  };
}

/** An Apex trigger's object and events, from its header: `trigger X on Lead (before insert, after update)`. */
export function readTriggerHeader(content: string): { object: string; events: string[] } | null {
  const code = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const match = code.match(/\btrigger\s+[A-Za-z_][A-Za-z0-9_]*\s+on\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i);
  if (!match) return null;
  return { object: match[1], events: match[2].split(',').map((event) => event.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean) };
}

function triggerSaves(events: string[], timing: 'before' | 'after'): Saves | null {
  const insert = events.includes(`${timing} insert`);
  const update = events.includes(`${timing} update`);
  return insert && update ? 'both' : insert ? 'create' : update ? 'update' : null;
}

export interface SalesforceSaveOrderResult {
  object: string;
  diagram: ProcessFlowDiagram;
  /** Automation steps drawn (not the platform's own). */
  automationCount: number;
  /** Package triggers with hidden source whose name mentions the object. */
  hiddenTriggers: string[];
  /** Inactive flows on the object, left out. */
  inactiveFlows: string[];
  /** Before-delete flows, left out of a save. */
  deleteFlows: string[];
}

interface Workspace {
  flows: ParsedSalesforceFlow[];
  files: SalesforceSourceFile[];
}

function workspace(sourceFiles: SalesforceSourceFile[]): Workspace {
  const flows = [...salesforceFlowFiles(sourceFiles)].flatMap(([name, file]) => {
    const flow = parseSalesforceFlow(name, file);
    return flow ? [flow] : [];
  });
  return { flows, files: sourceFiles };
}

/** Files under `<folder>/` whose name matches, case-insensitively. */
function filesIn(ws: Workspace, pattern: RegExp): SalesforceSourceFile[] {
  return ws.files.filter((file) => pattern.test(pathOf(file)));
}

/** "a Lead", "an Account". */
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One object's save, in order. */
function saveOrderFor(object: string, ws: Workspace): SalesforceSaveOrderResult {
  const o = escapeRegExp(object);
  const steps: Step[] = [];
  const add = (step: Step | null) => { if (step) steps.push(step); };
  const platform = (id: string, label: string, description: string) => add({ id, label, description, source: 'platform' });

  const onObject = ws.flows.filter((flow) => flow.triggerObject?.toLowerCase() === object.toLowerCase());
  const active = onObject.filter((flow) => flow.status === 'Active');
  const inactiveFlows = onObject.filter((flow) => flow.status !== 'Active' && flow.triggerType?.startsWith('Record')).map((flow) => flow.apiName).sort();
  const deleteFlows = active.filter((flow) => flow.triggerType === 'RecordBeforeDelete' || flow.recordTriggerType === 'Delete').map((flow) => flow.apiName).sort();
  const beforeSave = orderRecordTriggeredFlows(active.filter((flow) => flow.triggerType === 'RecordBeforeSave' && savesOfFlow(flow)));
  const afterSave = orderRecordTriggeredFlows(active.filter((flow) => flow.triggerType === 'RecordAfterSave' && savesOfFlow(flow)));

  // Triggers: the org's own carry their object in their header; a package's hidden source doesn't.
  const triggers = filesIn(ws, /(?:^|\/)triggers\/[^/]+\.trigger$/i).map((file) => ({
    file,
    name: pathOf(file).split('/').pop()!.replace(/\.trigger$/i, ''),
    header: readTriggerHeader(file.content),
    hidden: file.content.trim() === '(hidden)',
  }));
  const objectTriggers = triggers.filter((trigger) => trigger.header?.object.toLowerCase() === object.toLowerCase()).sort((a, b) => a.name.localeCompare(b.name));
  const hiddenTriggers = triggers.filter((trigger) => trigger.hidden && trigger.name.toLowerCase().includes(object.toLowerCase())).map((trigger) => trigger.name).sort();
  const triggerSteps = (timing: 'before' | 'after') => objectTriggers.flatMap((trigger) => {
    const saves = triggerSaves(trigger.header!.events, timing);
    return saves ? [{
      id: `trigger:${timing}:${trigger.name}`,
      label: labelled(trigger.name, saves),
      elementType: 'apexTrigger',
      description: `${timing === 'before' ? 'Before' : 'After'} trigger (${trigger.header!.events.join(', ')}).${objectTriggers.length > 1 ? ' Triggers on the same event run in no guaranteed order.' : ''}`,
      source: sourceFileRef(trigger.file),
    }] : [];
  });

  platform('system-validation', 'System validation', 'Field formats, lengths, required fields and foreign keys, as the request type calls for (Salesforce runs it).');
  beforeSave.forEach((flow) => add(flowStep(flow, 'Before-save flow')));
  triggerSteps('before').forEach(add);
  platform('system-validation-again', 'System validation again', 'Most system validation runs again, such as required fields, before the custom validation rules.');

  for (const file of filesIn(ws, new RegExp(`(?:^|/)objects/${o}/validationRules/[^/]+\\.validationRule-meta\\.xml$`, 'i')).sort((a, b) => pathOf(a).localeCompare(pathOf(b)))) {
    const xml = parse(file, 'ValidationRule');
    if (!xml || !flag(xml.active)) continue;
    const name = text(xml.fullName) ?? pathOf(file).split('/').pop()!.replace(/\.validationRule-meta\.xml$/i, '');
    const parts = [text(xml.description), text(xml.errorMessage) ? `Error: "${text(xml.errorMessage)}".` : '', text(xml.errorConditionFormula) ? `Fails when: ${text(xml.errorConditionFormula)}` : ''].filter(Boolean);
    add({ id: `validation:${name}`, label: name, elementType: 'validationRule', ...(parts.length > 0 ? { description: parts.join(' ') } : {}), source: sourceFileRef(file) });
  }

  for (const file of filesIn(ws, new RegExp(`(?:^|/)duplicateRules/${o}\\.[^/]+\\.duplicateRule-meta\\.xml$`, 'i')).sort((a, b) => pathOf(a).localeCompare(pathOf(b)))) {
    const xml = parse(file, 'DuplicateRule');
    if (!xml || !flag(xml.isActive)) continue;
    const name = text(xml.masterLabel) ?? pathOf(file).split('/').pop()!.replace(/\.duplicateRule-meta\.xml$/i, '');
    const onCreate = text(xml.actionOnInsert) ?? 'Allow';
    const onUpdate = text(xml.actionOnUpdate) ?? 'Allow';
    const blocks = onCreate === 'Block' || onUpdate === 'Block';
    add({
      id: `duplicate:${pathOf(file)}`,
      label: name,
      elementType: 'duplicateRule',
      description: `On create: ${onCreate.toLowerCase()}; on update: ${onUpdate.toLowerCase()}.${blocks ? ' A blocked duplicate stops the save: nothing after this runs.' : ''}${text(xml.description) ? ` ${text(xml.description)}` : ''}`,
      source: sourceFileRef(file),
    });
  }

  platform('saved', 'Saved, not committed', 'The record is written to the database, but not yet committed.');
  triggerSteps('after').forEach(add);

  const ruleFile = (folder: string, suffix: string) => filesIn(ws, new RegExp(`(?:^|/)${folder}/${o}\\.${suffix}(?:-meta\\.xml)?$`, 'i'))[0];
  const assignment = ruleFile('assignmentRules', 'assignmentRules');
  if (assignment) {
    const rules = list(parse(assignment, 'AssignmentRules')?.assignmentRule).flatMap((entry) => (node(entry) ? [node(entry)!] : []));
    const rule = rules.find((candidate) => flag(candidate.active));
    if (rule) {
      const entries = list(rule.ruleEntry).length;
      add({
        id: 'assignment', label: `Assignment rule: ${text(rule.fullName) ?? 'active rule'}`, elementType: 'assignmentRule',
        description: `${entries} ${entries === 1 ? 'entry' : 'entries'}. Runs when the save asks for it (the "Assign using active assignment rule" checkbox, Web-to-Lead or Web-to-Case, or the API header).`,
        source: sourceFileRef(assignment),
      });
    }
  }
  const autoResponse = ruleFile('autoResponseRules', 'autoResponseRules');
  if (autoResponse) {
    const rule = list(parse(autoResponse, 'AutoResponseRules')?.autoResponseRule).flatMap((entry) => (node(entry) ? [node(entry)!] : [])).find((candidate) => flag(candidate.active));
    if (rule) {
      add({
        id: 'auto-response', label: `Auto-response rule: ${text(rule.fullName) ?? 'active rule'}`, elementType: 'autoResponseRule',
        description: 'Runs when the record comes from Web-to-Lead, Web-to-Case or Email-to-Case, or when the API asks for it.',
        source: sourceFileRef(autoResponse),
      });
    }
  }

  const workflow = ruleFile('workflows', 'workflow');
  if (workflow) {
    const xml = parse(workflow, 'Workflow');
    for (const entry of list(xml?.rules)) {
      const rule = node(entry);
      if (!rule || !flag(rule.active)) continue;
      const name = text(rule.fullName) ?? 'workflow rule';
      const actions = list(rule.actions).flatMap((action) => (node(action) && text(node(action)!.name) ? [{ name: text(node(action)!.name)!, type: text(node(action)!.type) ?? '' }] : []));
      const updates = actions.filter((action) => action.type === 'FieldUpdate');
      const triggerType = text(rule.triggerType);
      const saves: Saves = triggerType === 'onCreateOnly' ? 'create' : 'both';
      const when = triggerType === 'onCreateOrTriggeringUpdate' ? 'On create, and on updates that newly meet its criteria.' : triggerType === 'onAllChanges' ? 'On create and every update that meets its criteria.' : '';
      add({
        id: `workflow:${name}`,
        label: labelled(name, saves),
        elementType: 'workflowRule',
        description: [
          when,
          actions.length > 0 ? `Actions: ${actions.map((action) => `${action.name} (${action.type})`).join(', ')}.` : '',
          updates.length > 0 ? 'Its field updates save the record again: before and after update triggers run once more (validation rules, flows and duplicate rules don\'t).' : '',
        ].filter(Boolean).join(' '),
        source: sourceFileRef(workflow),
      });
    }
  }

  const escalation = ruleFile('escalationRules', 'escalationRules');
  if (escalation) {
    const rule = list(parse(escalation, 'EscalationRules')?.escalationRule).flatMap((entry) => (node(entry) ? [node(entry)!] : [])).find((candidate) => flag(candidate.active));
    if (rule) add({ id: 'escalation', label: `Escalation rule: ${text(rule.fullName) ?? 'active rule'}`, elementType: 'escalationRule', source: sourceFileRef(escalation) });
  }

  // Process Builder processes on the object (flows of type Workflow): no guaranteed order.
  for (const flow of ws.flows.filter((candidate) => candidate.processType === 'Workflow' && candidate.status === 'Active').sort((a, b) => a.apiName.localeCompare(b.apiName))) {
    const xml = parse(flow.file, 'Flow');
    const objectType = list(xml?.processMetadataValues).flatMap((entry) => (node(entry) && text(node(entry)!.name) === 'ObjectType' ? [valueOf(node(entry)!.value)] : []))[0];
    if (objectType?.toLowerCase() !== object.toLowerCase()) continue;
    add({ id: `process:${flow.apiName}`, label: flow.label, elementType: 'process', description: 'A Process Builder process: runs with flows launched by workflow rules, in no guaranteed order.', source: sourceFileRef(flow.file) });
  }

  afterSave.forEach((flow) => add(flowStep(flow, 'After-save flow')));

  // Entitlement rules run for cases.
  if (object.toLowerCase() === 'case') {
    for (const file of filesIn(ws, /(?:^|\/)entitlementProcesses\/[^/]+\.entitlementProcess(?:-meta\.xml)?$/i).sort((a, b) => pathOf(a).localeCompare(pathOf(b)))) {
      const xml = parse(file, 'EntitlementProcess');
      if (!xml || !flag(xml.active)) continue;
      const name = text(xml.name) ?? pathOf(file).split('/').pop()!.replace(/\.entitlementProcess(?:-meta\.xml)?$/i, '');
      add({ id: `entitlement:${name}`, label: `Entitlement process: ${name}`, elementType: 'entitlementProcess', source: sourceFileRef(file) });
    }
  }

  // Roll-up summaries this object feeds: the parent recalculates and saves too.
  for (const file of filesIn(ws, /(?:^|\/)objects\/[^/]+\/fields\/[^/]+\.field-meta\.xml$/i)) {
    if (!/<type>Summary<\/type>/.test(file.content)) continue;
    const xml = parse(file, 'CustomField');
    const foreignKey = text(xml?.summaryForeignKey);
    if (!xml || !foreignKey || foreignKey.split('.')[0].toLowerCase() !== object.toLowerCase()) continue;
    const parent = pathOf(file).match(/objects\/([^/]+)\/fields\//)?.[1] ?? 'parent';
    const field = text(xml.fullName) ?? '';
    add({
      id: `rollup:${parent}.${field}`,
      label: `Roll-up ${parent}.${field}`,
      elementType: 'rollUpSummary',
      description: `${text(xml.summaryOperation) ?? 'A summary'} over ${foreignKey}: ${parent} recalculates and goes through its own save.`,
      source: sourceFileRef(file),
    });
  }

  const sharing = ruleFile('sharingRules', 'sharingRules');
  const criteriaRules = sharing ? list(parse(sharing, 'SharingRules')?.sharingCriteriaRules).flatMap((entry) => (text(node(entry)?.fullName) ? [text(node(entry)?.fullName)!] : [])) : [];
  if (sharing && criteriaRules.length > 0) {
    add({
      id: 'sharing', label: `${criteriaRules.length} criteria-based sharing ${criteriaRules.length === 1 ? 'rule' : 'rules'}`, elementType: 'sharingRule',
      description: `Evaluated before the commit: ${criteriaRules.join(', ')}.`,
      source: sourceFileRef(sharing),
    });
  }

  platform('commit', 'Committed', 'Every change in the transaction is committed. After it: emails, asynchronous Apex (queueable, future) and asynchronous paths.');
  for (const flow of afterSave.filter((candidate) => scheduledPaths(candidate).length > 0)) {
    add({
      id: `async:${flow.apiName}`,
      label: `${flow.label}: after the commit`,
      elementType: 'flow',
      description: `After the commit: ${scheduledPaths(flow).map((path) => path.label).join(', ')}.`,
      source: sourceFileRef(flow.file),
    });
  }

  const nodes: FlowNode[] = [
    { id: 'start', type: 'start', label: `${object} saved`, description: `An insert, update or upsert of ${withArticle(object)} record.`, source: 'platform' },
    ...steps.map((step): FlowNode => ({ ...step, type: 'step' })),
    { id: 'end', type: 'end', label: 'Done', source: 'platform' },
  ];
  const flows: Flow[] = nodes.slice(1).map((next, index) => ({ id: `${nodes[index].id}->${next.id}`, from: nodes[index].id, to: next.id }));
  const automationCount = steps.filter((step) => step.source !== 'platform').length;
  const notes = [
    `${automationCount} ${automationCount === 1 ? 'piece' : 'pieces'} of the org's automation in the order Salesforce runs them on a save.`,
    hiddenTriggers.length > 0 ? `Package triggers with hidden source can't be placed: ${hiddenTriggers.join(', ')} may run on ${object}.` : '',
  ].filter(Boolean);
  const diagram: ProcessFlowDiagram = {
    version: 1,
    kind: 'process_flow',
    platform: 'salesforce',
    title: `What runs when ${withArticle(object)} saves`,
    summary: notes.join(' '),
    nodes,
    flows,
    resources: [],
  };
  return { object, diagram, automationCount, hiddenTriggers, inactiveFlows, deleteFlows };
}

function valueOf(value: unknown): string | undefined {
  const xml = node(value);
  return xml ? text(xml.stringValue) ?? text(xml.elementReference) : undefined;
}

/** The objects the upload describes, by lower-case name, for matching what was asked. */
function knownObjects(ws: Workspace): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of ws.files) {
    const match = pathOf(file).match(/(?:^|\/)objects\/([^/.]+)(?:\/|\.object$)/i);
    if (match) names.set(match[1].toLowerCase(), match[1]);
  }
  for (const flow of ws.flows) if (flow.triggerObject) names.set(flow.triggerObject.toLowerCase(), flow.triggerObject);
  return names;
}

/** Each object's save order. An object the upload says nothing about is in notFound. */
export function buildSalesforceSaveOrders(
  sourceFiles: SalesforceSourceFile[],
  objects: string[],
): { results: SalesforceSaveOrderResult[]; notFound: string[] } {
  const ws = workspace(sourceFiles);
  const known = knownObjects(ws);
  const notFound: string[] = [];
  const results: SalesforceSaveOrderResult[] = [];
  for (const asked of [...new Set(objects.map((name) => name.trim()).filter(Boolean))]) {
    const name = known.get(asked.toLowerCase());
    if (!name) {
      notFound.push(asked);
      continue;
    }
    results.push(saveOrderFor(name, ws));
  }
  return { results, notFound };
}
