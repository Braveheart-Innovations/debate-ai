/**
 * A Salesforce Flow as a process diagram, read from its metadata: what
 * `salesforce_metadata_audit(operation="flow_diagram")` writes. Deterministic,
 * like the data model: one tested reader instead of XML the agent parses.
 *
 *  - The start is a start: its trigger (object, before or after save, create
 *    or update, a platform event, a schedule) labels it, and its entry
 *    conditions describe it. Scheduled paths branch from it.
 *  - Decisions are decisions, one branch per outcome plus the default; a loop
 *    is a decision with "For each item" and "After last item"; a wait branches
 *    per event. Every other element (record operations, actions, assignments,
 *    screens, subflows…) is a step with its element type.
 *  - Fault connectors are fault flows. An out a connector leaves empty goes to
 *    the end. Elements nothing connects to never run, so they're left out and
 *    named in the result.
 *  - A record operation or action without a fault path carries an issue (not
 *    in a before-save flow, which has no fault paths).
 *  - Chained, it also draws the flows these start: a subflow, a flow a
 *    platform event they publish starts (by creating `<Event>__e` records, or
 *    from the invocable Apex they call), a flow that Apex starts. Those links
 *    are launch flows. A record change that triggers another flow isn't
 *    followed: that needs the org.
 *
 * Every node's source is the Flow file; node ids are the element API names
 * (in a chain, prefixed with the flow's).
 */
import { XMLParser } from 'fast-xml-parser';
import { uniqueName, type Flow, type FlowNode, type ProcessFlowDiagram } from '../contract/services/analyze/diagrams/diagramFile';
import { list, node, sourceFileRef, text, type XmlNode } from './salesforceDataModel';
import type { SalesforceSourceFile } from './SalesforceMetadataService';

const ELEMENT_TAGS = [
  'actionCalls', 'apexPluginCalls', 'assignments', 'collectionProcessors', 'customErrors', 'decisions', 'loops',
  'orchestratedStages', 'recordCreates', 'recordDeletes', 'recordLookups', 'recordRollbacks', 'recordUpdates',
  'screens', 'steps', 'subflows', 'transforms', 'waits',
];

/** Elements that change data or call out: without a fault path, a failure stops the flow. */
const FAULT_HANDLED_TAGS = new Set(['recordCreates', 'recordUpdates', 'recordDeletes', 'actionCalls', 'apexPluginCalls']);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => [...ELEMENT_TAGS, 'rules', 'filters', 'scheduledPaths', 'waitEvents', 'inputAssignments', 'assignmentItems', 'connectors'].includes(name),
});

const NO_FAULT_PATH = 'No fault path: if it fails, the flow stops with an unhandled fault.';

const OPERATORS: Record<string, string> = {
  EqualTo: '=',
  NotEqualTo: '≠',
  GreaterThan: '>',
  GreaterThanOrEqualTo: '≥',
  LessThan: '<',
  LessThanOrEqualTo: '≤',
  Contains: 'contains',
  StartsWith: 'starts with',
  EndsWith: 'ends with',
  IsChanged: 'changed',
  WasSet: 'was set',
  WasSelected: 'was selected',
  WasVisited: 'was visited',
  In: 'is in',
  NotIn: 'is not in',
};

const TRIGGER_EVENTS: Record<string, string> = {
  Create: 'created',
  Update: 'updated',
  CreateAndUpdate: 'created or updated',
  Delete: 'deleted',
};

/** One element of a Flow, with where it goes. */
interface FlowElement {
  name: string;
  tag: string;
  xml: XmlNode;
}

/** A Flow file read: its elements, its start, and what it is. */
export interface ParsedSalesforceFlow {
  apiName: string;
  file: SalesforceSourceFile;
  label: string;
  status?: string;
  processType?: string;
  description?: string;
  start?: XmlNode;
  /** Older flows name their first element instead of having a start element. */
  startElementReference?: string;
  elements: Map<string, FlowElement>;
  triggerType?: string;
  triggerObject?: string;
  recordTriggerType?: string;
  triggerOrder?: number;
}

function target(connector: unknown): string | undefined {
  return text(node(connector)?.targetReference);
}

/** The Flow files in the upload, by API name (`flows/<Name>.flow-meta.xml` or `flows/<Name>.flow`). */
export function salesforceFlowFiles(sourceFiles: SalesforceSourceFile[]): Map<string, SalesforceSourceFile> {
  const flows = new Map<string, SalesforceSourceFile>();
  for (const file of sourceFiles) {
    const match = file.path.replace(/\\/g, '/').match(/(?:^|\/)flows\/([^/]+?)\.flow(?:-meta\.xml)?$/i);
    if (match) flows.set(match[1], file);
  }
  return flows;
}

export function parseSalesforceFlow(apiName: string, file: SalesforceSourceFile): ParsedSalesforceFlow | null {
  let root: XmlNode | undefined;
  try {
    root = node(node(parser.parse(file.content))?.Flow);
  } catch {
    return null;
  }
  if (!root) return null;
  const elements = new Map<string, FlowElement>();
  for (const tag of ELEMENT_TAGS) {
    for (const entry of list(root[tag])) {
      const xml = node(entry);
      const name = text(xml?.name);
      if (xml && name) elements.set(name, { name, tag, xml });
    }
  }
  const start = node(root.start);
  const order = Number(text(root.triggerOrder));
  const triggerType = text(start?.triggerType);
  const triggerObject = text(start?.object);
  const recordTriggerType = text(start?.recordTriggerType);
  const status = text(root.status);
  const processType = text(root.processType);
  const description = text(root.description);
  const startElementReference = text(root.startElementReference);
  return {
    apiName,
    file,
    label: text(root.label) ?? apiName,
    elements,
    ...(status ? { status } : {}),
    ...(processType ? { processType } : {}),
    ...(description ? { description } : {}),
    ...(start ? { start } : {}),
    ...(startElementReference ? { startElementReference } : {}),
    ...(triggerType ? { triggerType } : {}),
    ...(triggerObject ? { triggerObject } : {}),
    ...(recordTriggerType ? { recordTriggerType } : {}),
    ...(Number.isFinite(order) && text(root.triggerOrder) ? { triggerOrder: order } : {}),
  };
}

function valueText(value: unknown): string {
  const xml = node(value);
  if (!xml) return '';
  for (const key of ['stringValue', 'booleanValue', 'numberValue', 'dateValue', 'dateTimeValue', 'elementReference']) {
    const found = text(xml[key]);
    if (found !== undefined) return key === 'stringValue' ? `"${found}"` : found;
  }
  return '';
}

/** One filter in words: `Status = "Toured"`, `Email is blank`, `Ready_to_Convert__c changed`. */
function filterText(filter: XmlNode): string {
  const field = text(filter.field) ?? text(filter.leftValueReference) ?? '?';
  const operator = text(filter.operator) ?? '';
  const value = valueText(filter.value ?? filter.rightValue);
  if (operator === 'IsNull') return `${field} ${value === 'false' ? 'is not blank' : 'is blank'}`;
  if (operator === 'IsChanged' || operator === 'WasSet' || operator === 'WasSelected' || operator === 'WasVisited') {
    return value === 'false' ? `${field} not ${OPERATORS[operator]}` : `${field} ${OPERATORS[operator]}`;
  }
  return `${field} ${OPERATORS[operator] ?? operator} ${value}`.trim();
}

/** Filters joined by their logic: `and`, `or`, or a custom `1 AND (2 OR 3)`. */
function filtersText(filters: XmlNode[], logic: string | undefined): string {
  const parts = filters.map(filterText);
  if (parts.length === 0) return '';
  const mode = (logic ?? 'and').trim();
  if (/^and$/i.test(mode) || /^or$/i.test(mode)) return parts.join(` ${mode.toUpperCase()} `);
  // Custom logic: each number names a filter.
  return mode.replace(/\d+/g, (index) => parts[Number(index) - 1] ? `(${parts[Number(index) - 1]})` : index);
}

/** What starts the flow, in a few words: "Lead created or updated (after save)". */
export function flowTriggerLabel(flow: ParsedSalesforceFlow): string {
  const object = flow.triggerObject;
  const events = TRIGGER_EVENTS[flow.recordTriggerType ?? ''] ?? 'saved';
  switch (flow.triggerType) {
    case 'RecordBeforeSave':
      return `${object ?? 'Record'} ${events} (before save)`;
    case 'RecordAfterSave':
      return `${object ?? 'Record'} ${events} (after save)`;
    case 'RecordBeforeDelete':
      return `${object ?? 'Record'} deleted (before delete)`;
    case 'PlatformEvent':
      return `${object ?? 'Platform event'} received`;
    case 'Scheduled':
      return object ? `Scheduled run on ${object}` : 'Scheduled run';
    default:
      break;
  }
  if (flow.processType === 'Flow') return 'Screen flow starts';
  if (flow.processType === 'AutoLaunchedFlow') return 'Launched (by Apex, a button or another flow)';
  return flow.processType ? `${flow.processType} starts` : 'Flow starts';
}

/** The start's entry conditions and how it runs, in a line or two. */
function startDescription(flow: ParsedSalesforceFlow): string {
  const start = flow.start;
  const lines: string[] = [];
  if (start) {
    const filters = list(start.filters).flatMap((entry) => (node(entry) ? [node(entry)!] : []));
    const conditions = filtersText(filters, text(start.filterLogic));
    const formula = text(start.filterFormula);
    if (conditions) lines.push(`Runs when ${conditions}${text(start.doesRequireRecordChangedToMeetCriteria) === 'true' ? ', only when the record changes to meet them' : ''}.`);
    if (formula) lines.push(`Runs when: ${formula}`);
    const schedule = node(start.schedule);
    if (schedule) lines.push(`Runs ${text(schedule.frequency) ?? 'on a schedule'}${text(schedule.startDate) ? ` from ${text(schedule.startDate)}` : ''}${text(schedule.startTime) ? ` at ${text(schedule.startTime)}` : ''}.`);
  }
  if (flow.triggerOrder !== undefined) lines.push(`Trigger order ${flow.triggerOrder}.`);
  if (flow.status && flow.status !== 'Active') lines.push(`This version is ${flow.status}.`);
  return lines.join(' ');
}

/** What a record operation works on: "Lead records", "the triggering Lead record". */
function recordTarget(element: FlowElement, flow: ParsedSalesforceFlow): string {
  const object = text(element.xml.object);
  const input = text(element.xml.inputReference);
  if (input === '$Record') return `the triggering ${flow.triggerObject ?? 'record'}`;
  if (object) return `${object} records`;
  return input ? `the records in ${input}` : 'records';
}

/** Field names a create or update sets. */
function fieldsSet(element: FlowElement): string[] {
  return list(element.xml.inputAssignments).flatMap((entry) => (text(node(entry)?.field) ? [text(node(entry)?.field)!] : []));
}

/** What an element does, in a line, before its own description. */
function elementDescription(element: FlowElement, flow: ParsedSalesforceFlow): string {
  const { tag, xml } = element;
  const parts: string[] = [];
  const sets = fieldsSet(element);
  switch (tag) {
    case 'recordCreates':
      parts.push(`Creates ${recordTarget(element, flow)}${sets.length > 0 ? `, setting ${sets.join(', ')}` : ''}.`);
      break;
    case 'recordUpdates': {
      const filters = list(xml.filters).flatMap((entry) => (node(entry) ? [node(entry)!] : []));
      const where = filtersText(filters, text(xml.filterLogic));
      parts.push(`Updates ${recordTarget(element, flow)}${where ? ` where ${where}` : ''}${sets.length > 0 ? `, setting ${sets.join(', ')}` : ''}.`);
      break;
    }
    case 'recordDeletes':
      parts.push(`Deletes ${recordTarget(element, flow)}.`);
      break;
    case 'recordLookups': {
      const filters = list(xml.filters).flatMap((entry) => (node(entry) ? [node(entry)!] : []));
      const where = filtersText(filters, text(xml.filterLogic));
      parts.push(`Gets ${text(xml.object) ?? ''} records${where ? ` where ${where}` : ''}.`.replace('Gets  records', 'Gets records'));
      break;
    }
    case 'actionCalls':
      parts.push(`Calls ${text(xml.actionType) ?? 'an'} action ${text(xml.actionName) ?? element.name}.`);
      break;
    case 'apexPluginCalls':
      parts.push(`Calls the Apex plug-in ${text(xml.apexClass) ?? element.name}.`);
      break;
    case 'subflows':
      parts.push(`Runs the flow ${text(xml.flowName) ?? '?'}.`);
      break;
    case 'assignments': {
      const targets = list(xml.assignmentItems).flatMap((entry) => (text(node(entry)?.assignToReference) ? [text(node(entry)?.assignToReference)!] : []));
      if (targets.length > 0) parts.push(`Sets ${[...new Set(targets)].join(', ')}.`);
      break;
    }
    case 'loops':
      if (text(xml.collectionReference)) parts.push(`Goes through ${text(xml.collectionReference)}.`);
      break;
    default:
      break;
  }
  const own = text(xml.description);
  if (own) parts.push(own);
  return parts.join(' ');
}

/** Where an element goes: its outs (labelled for a decision's outcomes), and its fault path. */
function elementOuts(element: FlowElement): { outs: Array<{ to?: string; label?: string }>; fault?: string } {
  const { tag, xml } = element;
  const fault = target(xml.faultConnector);
  if (tag === 'decisions') {
    const rules = list(xml.rules).flatMap((entry) => {
      const rule = node(entry);
      return rule ? [{ to: target(rule.connector), label: text(rule.label) ?? text(rule.name) }] : [];
    });
    return { outs: [...rules, { to: target(xml.defaultConnector), label: text(xml.defaultConnectorLabel) ?? 'Default outcome' }] };
  }
  if (tag === 'loops') {
    return { outs: [{ to: target(xml.nextValueConnector), label: 'For each item' }, { to: target(xml.noMoreValuesConnector), label: 'After last item' }] };
  }
  if (tag === 'waits') {
    const events = list(xml.waitEvents).flatMap((entry) => {
      const event = node(entry);
      return event ? [{ to: target(event.connector), label: text(event.label) ?? text(event.name) }] : [];
    });
    return { outs: [...events, { to: target(xml.defaultConnector), label: text(xml.defaultConnectorLabel) ?? 'Default path' }], ...(fault ? { fault } : {}) };
  }
  // The old Step element can have several connectors.
  const connectors = list(xml.connectors).flatMap((entry) => (target(entry) ? [{ to: target(entry) }] : []));
  const outs = connectors.length > 1 ? connectors : [{ to: target(xml.connector) ?? connectors[0]?.to }];
  return { outs, ...(fault ? { fault } : {}) };
}

/** Where the flow begins: the start's connector, or the old startElementReference. */
function firstElement(flow: ParsedSalesforceFlow): string | undefined {
  return target(flow.start?.connector) ?? flow.startElementReference;
}

/** The scheduled paths that branch from the start, with where each goes. */
function scheduledPaths(flow: ParsedSalesforceFlow): Array<{ to?: string; label: string }> {
  return list(flow.start?.scheduledPaths).flatMap((entry) => {
    const path = node(entry);
    if (!path) return [];
    const offset = [text(path.offsetNumber), text(path.offsetUnit)?.toLowerCase(), text(path.timeSource) ? `from ${text(path.timeSource)}` : ''].filter(Boolean).join(' ');
    return [{ to: target(path.connector), label: text(path.label) ?? (offset || text(path.name) || 'Scheduled path') }];
  });
}

/** Every element the start reaches, in the order it reaches them: the ones that can run. */
function reachedElements(flow: ParsedSalesforceFlow): string[] {
  const reached: string[] = [];
  const seen = new Set<string>();
  const queue = [firstElement(flow), ...scheduledPaths(flow).map((path) => path.to)].filter((name): name is string => Boolean(name && flow.elements.has(name)));
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    reached.push(name);
    const { outs, fault } = elementOuts(flow.elements.get(name)!);
    for (const next of [...outs.map((out) => out.to), fault]) if (next && flow.elements.has(next) && !seen.has(next)) queue.push(next);
  }
  return reached;
}

/** What a flow starts: subflows, flows its platform events start, flows its Apex starts. */
export interface FlowLink {
  /** The element that starts it. */
  fromElement: string;
  flow: string;
  label: string;
}

interface ChainContext {
  flowFiles: Map<string, SalesforceSourceFile>;
  /** Flows that a platform event starts, by event (lower case). */
  flowsByEvent: Map<string, string[]>;
  apexByName: Map<string, SalesforceSourceFile>;
}

/** The platform events and flows an Apex class names: what it may publish or start. */
function apexStarts(source: string): { events: string[]; flows: string[] } {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const events = [...new Set([...code.matchAll(/\b([A-Za-z][A-Za-z0-9_]*__e)\b/g)].map((match) => match[1]))];
  const flows = [...new Set([
    ...[...code.matchAll(/\bFlow\.Interview\.([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1]).filter((name) => name !== 'createInterview'),
    ...[...code.matchAll(/\bFlow\.Interview\.createInterview\(\s*'([^']+)'/g)].map((match) => match[1]),
  ])];
  return { events, flows };
}

function flowNamed(name: string, files: Map<string, SalesforceSourceFile>): string | undefined {
  if (files.has(name)) return name;
  const lower = name.toLowerCase();
  return [...files.keys()].find((candidate) => candidate.toLowerCase() === lower);
}

export function flowLinks(flow: ParsedSalesforceFlow, context: ChainContext): FlowLink[] {
  const links: FlowLink[] = [];
  const add = (fromElement: string, flowName: string | undefined, label: string) => {
    const name = flowName ? flowNamed(flowName, context.flowFiles) : undefined;
    if (name && name !== flow.apiName && !links.some((link) => link.fromElement === fromElement && link.flow === name)) links.push({ fromElement, flow: name, label });
  };
  const publishes = (fromElement: string, event: string, label: string) => {
    for (const subscriber of context.flowsByEvent.get(event.toLowerCase()) ?? []) add(fromElement, subscriber, label);
  };
  // Only elements that can run start anything, in the order the flow reaches them.
  for (const element of reachedElements(flow).map((name) => flow.elements.get(name)!)) {
    if (element.tag === 'subflows') add(element.name, text(element.xml.flowName), 'runs subflow');
    if (element.tag === 'recordCreates') {
      const object = text(element.xml.object);
      if (object && /__e$/i.test(object)) publishes(element.name, object, `publishes ${object}`);
    }
    if (element.tag === 'actionCalls' && text(element.xml.actionType) === 'apex') {
      const className = text(element.xml.actionName);
      const apex = className ? context.apexByName.get(className.toLowerCase()) : undefined;
      if (!apex || !className) continue;
      const { events, flows } = apexStarts(apex.content);
      for (const event of events) publishes(element.name, event, `${className} publishes ${event}`);
      for (const started of flows) add(element.name, started, `${className} starts it`);
    }
  }
  return links;
}

function chainContext(sourceFiles: SalesforceSourceFile[], flowFiles: Map<string, SalesforceSourceFile>): ChainContext {
  const flowsByEvent = new Map<string, string[]>();
  for (const [name, file] of flowFiles) {
    // Only the start matters here: a cheap read of its trigger.
    const startBlock = file.content.match(/<start>([\s\S]*?)<\/start>/)?.[1] ?? '';
    if (!/<triggerType>PlatformEvent<\/triggerType>/.test(startBlock)) continue;
    const event = startBlock.match(/<object>([^<]+)<\/object>/)?.[1]?.trim();
    if (event) flowsByEvent.set(event.toLowerCase(), [...(flowsByEvent.get(event.toLowerCase()) ?? []), name]);
  }
  const apexByName = new Map<string, SalesforceSourceFile>();
  for (const file of sourceFiles) {
    const match = file.path.replace(/\\/g, '/').match(/(?:^|\/)classes\/([^/]+)\.cls$/i);
    if (match) apexByName.set(match[1].toLowerCase(), file);
  }
  return { flowFiles, flowsByEvent, apexByName };
}

interface DrawnFlow {
  nodes: FlowNode[];
  flows: Flow[];
  startId: string;
  /** Element names nothing connects to (they never run). */
  unreachable: string[];
}

/** One flow's nodes and flows, ids prefixed (in a chain) so flows can share a file. */
function drawFlow(flow: ParsedSalesforceFlow, prefix: string, startLabel: string): DrawnFlow {
  const source = sourceFileRef(flow.file);
  const id = (name: string) => `${prefix}${name}`;
  const taken = new Set([...flow.elements.keys()]);
  const startName = uniqueName(taken, 'start');
  taken.add(startName);
  const endName = uniqueName(taken, 'end');
  const startId = id(startName);
  const endId = id(endName);
  const nodes: FlowNode[] = [];
  const flows: Flow[] = [];
  const flowIds = new Set<string>();
  const addFlow = (from: string, to: string, extra: Partial<Flow> = {}) => {
    const flowId = uniqueName(flowIds, `${from}->${to}`);
    flowIds.add(flowId);
    flows.push({ id: flowId, from, to, ...extra });
  };
  const beforeSave = flow.triggerType === 'RecordBeforeSave';

  const description = startDescription(flow);
  nodes.push({ id: startId, type: 'start', label: startLabel, elementType: 'start', ...(description ? { description } : {}), source });

  // Where the flow begins: the start's connector (or the old startElementReference), and its scheduled paths.
  const first = firstElement(flow);
  const paths = scheduledPaths(flow);
  const elementId = (name: string | undefined) => (name && flow.elements.has(name) ? id(name) : endId);
  if (paths.length > 0) {
    const branches = [...(first ? [{ to: first, label: 'Run immediately' }] : []), ...paths];
    if (branches.length === 1) {
      addFlow(startId, elementId(branches[0].to), { label: branches[0].label });
    } else {
      const pathsId = id(uniqueName(taken, 'paths'));
      nodes.push({ id: pathsId, type: 'decision', label: 'When it runs', elementType: 'scheduledPaths', source });
      addFlow(startId, pathsId);
      for (const branch of branches) addFlow(pathsId, elementId(branch.to), { label: branch.label });
    }
  } else {
    addFlow(startId, elementId(first));
  }

  const reached = reachedElements(flow);
  const seen = new Set(reached);

  let endUsed = !first || !flow.elements.has(first) || paths.some((path) => !path.to || !flow.elements.has(path.to));
  for (const name of reached) {
    const element = flow.elements.get(name)!;
    const { outs, fault } = elementOuts(element);
    const isDecision = element.tag === 'decisions' || element.tag === 'loops' || element.tag === 'waits';
    const details = elementDescription(element, flow);
    const issues = FAULT_HANDLED_TAGS.has(element.tag) && !fault && !beforeSave ? [NO_FAULT_PATH] : [];
    nodes.push({
      id: id(name),
      type: isDecision ? 'decision' : 'step',
      label: text(element.xml.label) ?? name,
      elementType: element.tag,
      ...(details ? { description: details } : {}),
      source,
      ...(issues.length > 0 ? { issues } : {}),
    });
    for (const out of outs) {
      const to = elementId(out.to);
      if (to === endId) endUsed = true;
      addFlow(id(name), to, out.label ? { label: out.label } : {});
    }
    if (fault) {
      const to = elementId(fault);
      if (to === endId) endUsed = true;
      addFlow(id(name), to, { fault: true });
    }
  }
  if (endUsed || reached.length === 0) nodes.push({ id: endId, type: 'end', label: 'End', source });
  const unreachable = [...flow.elements.keys()].filter((name) => !seen.has(name));
  return { nodes, flows, startId, unreachable };
}

export interface SalesforceFlowDiagramResult {
  diagram: ProcessFlowDiagram;
  /** The flows drawn: the ones asked for, then (chained) the ones they start. */
  flows: string[];
  links: Array<FlowLink & { from: string }>;
  /** Elements nothing connects to, by flow. */
  unreachable: Record<string, string[]>;
  /** Elements without a fault path. */
  issueCount: number;
}

/**
 * The diagram of each named flow (or, chained, one diagram of them and every
 * flow they start). Null for a name the upload has no Flow file for.
 */
export function buildSalesforceFlowDiagrams(
  sourceFiles: SalesforceSourceFile[],
  options: { flows: string[]; chain?: boolean },
): { results: SalesforceFlowDiagramResult[]; notFound: string[] } {
  const flowFiles = salesforceFlowFiles(sourceFiles);
  const wanted = [...new Set(options.flows.map((name) => name.trim()).filter(Boolean))];
  const notFound: string[] = [];
  const parsed = new Map<string, ParsedSalesforceFlow>();
  const parse = (name: string): ParsedSalesforceFlow | null => {
    if (parsed.has(name)) return parsed.get(name)!;
    const file = flowFiles.get(name);
    const flow = file ? parseSalesforceFlow(name, file) : null;
    if (flow) parsed.set(name, flow);
    return flow;
  };
  const roots = wanted.flatMap((name) => {
    const found = flowNamed(name, flowFiles);
    if (!found || !parse(found)) {
      notFound.push(name);
      return [];
    }
    return [found];
  });

  if (!options.chain) {
    const results = roots.map((name) => {
      const flow = parse(name)!;
      const drawn = drawFlow(flow, '', flowTriggerLabel(flow));
      return {
        diagram: flowDiagram(`Flow: ${flow.label}`, `${flowTriggerLabel(flow)}: ${flow.description ?? `the ${flow.label} flow`}, drawn from ${flow.apiName}.`, drawn.nodes, drawn.flows),
        flows: [name],
        links: [],
        unreachable: drawn.unreachable.length > 0 ? { [name]: drawn.unreachable } : {},
        issueCount: countIssues(drawn.nodes),
      };
    });
    return { results, notFound };
  }

  if (roots.length === 0) return { results: [], notFound };
  // Chained: every flow the roots start, breadth first, each drawn once.
  const context = chainContext(sourceFiles, flowFiles);
  const order: string[] = [];
  const links: Array<FlowLink & { from: string }> = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (order.includes(name)) continue;
    const flow = parse(name);
    if (!flow) continue;
    order.push(name);
    for (const link of flowLinks(flow, context)) {
      if (!parse(link.flow)) continue;
      links.push({ ...link, from: name });
      if (!order.includes(link.flow)) queue.push(link.flow);
    }
  }
  const nodes: FlowNode[] = [];
  const flows: Flow[] = [];
  const starts = new Map<string, string>();
  const unreachable: Record<string, string[]> = {};
  for (const name of order) {
    const flow = parse(name)!;
    const drawn = drawFlow(flow, `${name}.`, `${flow.label}: ${flowTriggerLabel(flow)}`);
    nodes.push(...drawn.nodes);
    flows.push(...drawn.flows);
    starts.set(name, drawn.startId);
    if (drawn.unreachable.length > 0) unreachable[name] = drawn.unreachable;
  }
  for (const link of links) {
    flows.push({ id: uniqueName(flows.map((flow) => flow.id), `${link.from}.${link.fromElement}=>${link.flow}`), from: `${link.from}.${link.fromElement}`, to: starts.get(link.flow)!, launch: true, label: link.label });
  }
  const first = parse(order[0])!;
  const title = roots.length === 1 ? `Flow chain: ${first.label}` : `Flow chain: ${roots.map((name) => parse(name)!.label).join(', ')}`;
  const summary = `${order.length} flows: ${roots.join(', ')} and the flows they start through subflows, platform events and Apex, read from the upload.`;
  return {
    results: [{ diagram: flowDiagram(title, summary, nodes, flows), flows: order, links, unreachable, issueCount: countIssues(nodes) }],
    notFound,
  };
}

function countIssues(nodes: FlowNode[]): number {
  return nodes.filter((entry) => entry.issues && entry.issues.length > 0).length;
}

function flowDiagram(title: string, summary: string, nodes: FlowNode[], flows: Flow[]): ProcessFlowDiagram {
  return { version: 1, kind: 'process_flow', platform: 'salesforce', title, summary, nodes, flows, resources: [] };
}
