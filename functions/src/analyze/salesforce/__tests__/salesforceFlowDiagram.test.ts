import { reviewDiagram } from '../../contract/services/analyze/diagrams/diagramFile';
import type { SalesforceSourceFile } from '../SalesforceMetadataService';
import { buildSalesforceFlowDiagrams, flowTriggerLabel, parseSalesforceFlow } from '../salesforceFlowDiagram';

const ZIP = '/uploads/qa.zip';

function zipped(path: string, content: string): SalesforceSourceFile {
  return { path, content, sizeBytes: content.length, sourcePath: ZIP };
}

function flowFile(name: string, body: string): SalesforceSourceFile {
  return zipped(`force-app/main/default/flows/${name}.flow-meta.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<Flow xmlns="http://soap.sforce.com/2006/04/metadata">\n${body}\n</Flow>`);
}

const connector = (to: string) => `<connector><targetReference>${to}</targetReference></connector>`;

/** After a Lead saves: look up the queue, decide, loop over members, assign (no fault path), log errors. */
const ROUTE = flowFile('Route_to_CRC_Queue', `
  <label>Route to CRC Queue</label>
  <processType>AutoLaunchedFlow</processType>
  <status>Active</status>
  <triggerOrder>10</triggerOrder>
  <start>
    ${connector('Get_Queue')}
    <filterLogic>and</filterLogic>
    <filters><field>Status</field><operator>EqualTo</operator><value><stringValue>Inquiry</stringValue></value></filters>
    <filters><field>Email</field><operator>IsNull</operator><value><booleanValue>false</booleanValue></value></filters>
    <doesRequireRecordChangedToMeetCriteria>true</doesRequireRecordChangedToMeetCriteria>
    <object>Lead</object>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <triggerType>RecordAfterSave</triggerType>
  </start>
  <recordLookups>
    <name>Get_Queue</name><label>Get queue</label>${connector('Found')}<getFirstRecordOnly>true</getFirstRecordOnly><sortField>CreatedDate</sortField><sortOrder>Desc</sortOrder>
    <faultConnector><targetReference>Log_Error</targetReference></faultConnector>
    <object>Group</object>
    <filters><field>DeveloperName</field><operator>EqualTo</operator><value><stringValue>CRC</stringValue></value></filters>
  </recordLookups>
  <decisions>
    <name>Found</name><label>Queue found?</label>
    <defaultConnectorLabel>Not found</defaultConnectorLabel>
    <rules><name>Yes</name><label>Yes</label>${connector('Each_Member')}</rules>
  </decisions>
  <loops>
    <name>Each_Member</name><label>Each member</label><collectionReference>Get_Members</collectionReference>
    <nextValueConnector><targetReference>Notify</targetReference></nextValueConnector>
    <noMoreValuesConnector><targetReference>Assign</targetReference></noMoreValuesConnector>
  </loops>
  <actionCalls><name>Notify</name><label>Notify member</label>${connector('Each_Member')}<actionName>Lead.Notify</actionName><actionType>emailAlert</actionType></actionCalls>
  <recordUpdates>
    <name>Assign</name><label>Assign Lead</label><inputReference>$Record</inputReference>
    <inputAssignments><field>OwnerId</field><value><elementReference>Get_Queue.Id</elementReference></value></inputAssignments>
  </recordUpdates>
  <recordCreates><name>Log_Error</name><label>Log the error</label><object>Error_Log__c</object></recordCreates>
  <assignments><name>Orphan</name><label>Never connected</label></assignments>
`);

describe('a Flow as a process diagram', () => {
  it('draws the start with its trigger and entry conditions, decisions, a loop, steps and a fault path', () => {
    const { results, notFound } = buildSalesforceFlowDiagrams([ROUTE], { flows: ['route_to_crc_queue'] });
    expect(notFound).toEqual([]);
    const [{ diagram, unreachable, issueCount }] = results;
    expect(diagram).toMatchObject({ kind: 'process_flow', platform: 'salesforce', title: 'Flow: Route to CRC Queue' });
    expect(diagram.nodes.map((node) => [node.id, node.type, node.elementType])).toEqual([
      ['start', 'start', undefined],
      ['Get_Queue', 'step', 'recordLookups'],
      ['Found', 'decision', 'decisions'],
      ['Log_Error', 'step', 'recordCreates'],
      ['Each_Member', 'decision', 'loops'],
      ['Notify', 'step', 'actionCalls'],
      ['Assign', 'step', 'recordUpdates'],
      ['end', 'end', undefined],
    ]);
    expect(diagram.nodes[0]).toMatchObject({
      label: 'Lead created or updated (after save)',
      description: 'Runs when Status = "Inquiry" AND Email is not blank, only when the record changes to meet them. Trigger order 10.',
      source: `${ZIP}#force-app/main/default/flows/Route_to_CRC_Queue.flow-meta.xml`,
    });
    expect(diagram.flows.map((flow) => [flow.from, flow.to, flow.label ?? '', flow.fault ?? false])).toEqual([
      ['start', 'Get_Queue', '', false],
      ['Get_Queue', 'Found', '', false],
      ['Get_Queue', 'Log_Error', '', true],
      ['Found', 'Each_Member', 'Yes', false],
      ['Found', 'end', 'Not found', false],
      ['Log_Error', 'end', '', false],
      ['Each_Member', 'Notify', 'For Each Item', false],
      ['Each_Member', 'Assign', 'After Last Item', false],
      ['Notify', 'Each_Member', '', false],
      ['Assign', 'end', '', false],
    ]);
    expect(unreachable).toEqual({ Route_to_CRC_Queue: ['Orphan'] });
    expect(reviewDiagram(diagram)).toMatchObject({ problems: [], warnings: [] });
    // The action, the update and the create have no fault path; the lookup has one.
    expect(issueCount).toBe(3);
    expect(diagram.nodes.find((node) => node.id === 'Assign')).toMatchObject({
      description: 'Updates the triggering Lead, setting OwnerId.',
      issues: ['No fault path: if it fails, the flow stops with an unhandled fault.'],
    });
    expect(diagram.nodes.find((node) => node.id === 'Get_Queue')).toMatchObject({ description: 'Gets Group records where DeveloperName = "CRC".' });
    expect(diagram.nodes.find((node) => node.id === 'Get_Queue')!.issues).toBeUndefined();
  });

  it('branches scheduled paths from the start, and marks no issues in a before-save flow', () => {
    const scheduled = flowFile('Follow_Up', `
      <label>Follow up</label><processType>AutoLaunchedFlow</processType><status>Active</status>
      <start>
        ${connector('Touch')}
        <object>Opportunity</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordAfterSave</triggerType>
        <scheduledPaths><name>Later</name><label>3 days after close</label>${connector('Remind')}<offsetNumber>3</offsetNumber><offsetUnit>Days</offsetUnit><timeSource>RecordField</timeSource></scheduledPaths>
      </start>
      <recordUpdates><name>Touch</name><label>Touch</label><inputReference>$Record</inputReference></recordUpdates>
      <actionCalls><name>Remind</name><label>Remind</label><actionName>Remind</actionName><actionType>emailAlert</actionType></actionCalls>
    `);
    const beforeSave = flowFile('Set_Source', `
      <label>Set source</label><processType>AutoLaunchedFlow</processType><status>Draft</status>
      <start>${connector('Set')}<object>Lead</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordBeforeSave</triggerType></start>
      <recordUpdates><name>Set</name><label>Set the source</label><inputReference>$Record</inputReference></recordUpdates>
    `);
    const { results } = buildSalesforceFlowDiagrams([scheduled, beforeSave], { flows: ['Follow_Up', 'Set_Source'] });
    const follow = results[0].diagram;
    expect(follow.nodes.find((node) => node.id === 'paths')).toMatchObject({ type: 'decision', label: 'When it runs' });
    expect(follow.flows.filter((flow) => flow.from === 'paths').map((flow) => [flow.to, flow.label])).toEqual([['Touch', 'Run immediately'], ['Remind', '3 days after close']]);
    expect(reviewDiagram(follow).problems).toEqual([]);
    const set = results[1].diagram;
    expect(set.nodes[0]).toMatchObject({ label: 'Lead created (before save)', description: 'This version is Draft.' });
    expect(results[1].issueCount).toBe(0);
  });

  it('labels what starts each kind of flow', () => {
    const label = (start: string, processType = 'AutoLaunchedFlow') => flowTriggerLabel(parseSalesforceFlow('F', flowFile('F', `<label>F</label><processType>${processType}</processType>${start}`))!);
    expect(label('<start><object>Convert_Lead__e</object><triggerType>PlatformEvent</triggerType></start>')).toBe('Convert_Lead__e received');
    expect(label('<start><object>Account</object><triggerType>RecordBeforeDelete</triggerType></start>')).toBe('Account deleted (before delete)');
    expect(label('<start><triggerType>Scheduled</triggerType></start>')).toBe('Scheduled run');
    expect(label('', 'Flow')).toBe('Screen flow starts');
    expect(label('')).toBe('Launched by Apex or another flow');
  });

  it('sums the Flow up from what it holds, and keeps its own description (often version notes) on the start', () => {
    const noted = flowFile('Route_to_CRC_Queue', ROUTE.content.replace('<label>Route to CRC Queue</label>', '<label>Route to CRC Queue</label><description>Hello World: saving new version to remove tag</description>').replace(/^<\?xml[^>]*>\n<Flow[^>]*>\n|\n<\/Flow>$/g, ''));
    const [{ diagram }] = buildSalesforceFlowDiagrams([noted], { flows: ['Route_to_CRC_Queue'] }).results;
    expect(diagram.summary).toBe('Lead created or updated (after save). 6 elements: 2 decisions and loops, 3 record operations, 1 action; 3 without a fault path. Drawn from Route_to_CRC_Queue.');
    expect(diagram.summary).not.toContain('Hello World');
    expect(diagram.nodes[0].description).toContain('Its description: Hello World: saving new version to remove tag');
  });

  it('gives every node its element facts: API name, line, object, filters, values set, outcomes, action', () => {
    const [{ diagram }] = buildSalesforceFlowDiagrams([ROUTE], { flows: ['Route_to_CRC_Queue'] }).results;
    const facts = (id: string) => diagram.nodes.find((node) => node.id === id)!.element;
    expect(facts('start')).toEqual({ apiName: 'Start', trigger: 'RecordAfterSave', object: 'Lead', filterLogic: 'and', filters: [{ field: 'Status', operator: 'EqualTo', value: '"Inquiry"' }, { field: 'Email', operator: 'IsNull', value: 'false' }] });
    expect(facts('Get_Queue')).toMatchObject({ apiName: 'Get_Queue', object: 'Group', filterLogic: 'and', filters: [{ field: 'DeveloperName', operator: 'EqualTo', value: '"CRC"' }] });
    expect(facts('Get_Queue')!.line).toBeGreaterThan(1);
    expect(facts('Found')!.outcomes).toEqual([{ label: 'Yes', conditions: [] }, { label: 'Not found', conditions: [], isDefault: true }]);
    expect(facts('Each_Member')).toMatchObject({ collection: 'Get_Members' });
    expect(facts('Notify')).toMatchObject({ action: { name: 'Lead.Notify', type: 'emailAlert' } });
    expect(facts('Assign')).toMatchObject({ object: 'Lead', inputRecord: '$Record', assignments: [{ field: 'OwnerId', value: 'Get_Queue.Id' }] });
    expect(facts('Get_Queue')).toMatchObject({ firstRecordOnly: true, sort: { field: 'CreatedDate', order: 'Desc' } });
  });

  it('flags every element that can fail without a fault path: Get Records and Waits too, not Subflows', () => {
    const flow = flowFile('Check_Members', `
      <label>Check members</label><processType>AutoLaunchedFlow</processType><status>Active</status>
      <start>${connector('Find')}</start>
      <recordLookups><name>Find</name><label>Find the user</label>${connector('Pause')}<object>User</object></recordLookups>
      <waits><name>Pause</name><label>Wait a day</label><defaultConnector><targetReference>Run</targetReference></defaultConnector></waits>
      <subflows><name>Run</name><label>Run the checks</label><flowName>Checks</flowName></subflows>
    `);
    const [{ diagram }] = buildSalesforceFlowDiagrams([flow], { flows: ['Check_Members'] }).results;
    const flagged = diagram.nodes.filter((node) => node.issues?.some((issue) => issue.startsWith('No fault path'))).map((node) => node.id);
    expect(flagged).toEqual(['Find', 'Pause']);
  });

  it('flags a record operation inside a loop against the transaction\'s limits', () => {
    const looped = flowFile('Notify_Members', `
      <label>Notify members</label><processType>AutoLaunchedFlow</processType><status>Active</status>
      <start>${connector('Each')}</start>
      <loops><name>Each</name><label>Each member</label><collectionReference>Members</collectionReference>
        <nextValueConnector><targetReference>Find</targetReference></nextValueConnector>
        <noMoreValuesConnector><targetReference>Done</targetReference></noMoreValuesConnector></loops>
      <recordLookups><name>Find</name><label>Find the user</label>${connector('Save')}<object>User</object></recordLookups>
      <recordUpdates><name>Save</name><label>Save the member</label>${connector('Each')}<inputReference>Member</inputReference></recordUpdates>
      <assignments><name>Done</name><label>Done</label></assignments>
    `);
    const [{ diagram }] = buildSalesforceFlowDiagrams([looped], { flows: ['Notify_Members'] }).results;
    const issues = (id: string) => diagram.nodes.find((node) => node.id === id)!.issues ?? [];
    expect(issues('Find')).toContain('In a loop (Each member): this query runs once per item, and each one counts toward the 100 SOQL queries a transaction allows (200 asynchronous).');
    expect(issues('Save')).toContain('In a loop (Each member): this update runs once per item, and each one counts toward the 150 DML statements a transaction allows.');
    expect(issues('Done').some((issue) => issue.startsWith('In a loop'))).toBe(false);
    expect(diagram.summary).toContain('2 record operations inside a loop');
  });

  it('says which flows it could not find', () => {
    expect(buildSalesforceFlowDiagrams([ROUTE], { flows: ['Nope'] })).toEqual({ results: [], notFound: ['Nope'] });
  });
});

describe('a chain of Flows', () => {
  const core = flowFile('Core', `
    <label>Core</label><processType>AutoLaunchedFlow</processType><status>Active</status>
    <start>${connector('Child')}</start>
    <subflows><name>Child</name><label>Make the child</label>${connector('Publish')}<flowName>Child_Flow</flowName></subflows>
    <recordCreates><name>Publish</name><label>Publish convert</label>${connector('Reparent')}<object>Convert__e</object></recordCreates>
    <actionCalls><name>Reparent</name><label>Reparent</label><actionName>ReparentInvocable</actionName><actionType>apex</actionType></actionCalls>
  `);
  const child = flowFile('Child_Flow', `<label>Child flow</label><processType>AutoLaunchedFlow</processType><start>${connector('Done')}</start><assignments><name>Done</name><label>Done</label></assignments>`);
  const convert = flowFile('Convert', `<label>Convert</label><processType>AutoLaunchedFlow</processType><start>${connector('Go')}<object>Convert__e</object><triggerType>PlatformEvent</triggerType></start><assignments><name>Go</name><label>Go</label></assignments>`);
  const tasks = flowFile('Reparent_Tasks', `<label>Reparent tasks</label><processType>AutoLaunchedFlow</processType><start>${connector('Move')}<object>Reparent_Tasks__e</object><triggerType>PlatformEvent</triggerType></start><assignments><name>Move</name><label>Move</label></assignments>`);
  const apex = zipped('force-app/main/default/classes/ReparentInvocable.cls', `public class ReparentInvocable {
    // new Old_Event__e() is commented out
    @InvocableMethod public static void run(List<Id> ids) { EventBus.publish(new Reparent_Tasks__e()); new Flow.Interview.Child_Flow(new Map<String, Object>()).start(); }
  }`);

  it('draws the flows and every flow they start as one diagram, joined by launch flows', () => {
    const { results } = buildSalesforceFlowDiagrams([core, child, convert, tasks, apex], { flows: ['Core'], chain: true });
    const [{ diagram, flows, links }] = results;
    expect(flows).toEqual(['Core', 'Child_Flow', 'Convert', 'Reparent_Tasks']);
    expect(links.map((link) => [link.from, link.fromElement, link.flow, link.label])).toEqual([
      ['Core', 'Child', 'Child_Flow', 'runs subflow'],
      ['Core', 'Publish', 'Convert', 'publishes Convert__e'],
      ['Core', 'Reparent', 'Reparent_Tasks', 'ReparentInvocable publishes Reparent_Tasks__e'],
      ['Core', 'Reparent', 'Child_Flow', 'ReparentInvocable starts it'],
    ]);
    expect(diagram.title).toBe('Flow chain: Core');
    expect(diagram.nodes.filter((node) => node.type === 'start').map((node) => [node.id, node.label])).toEqual([
      ['Core.start', 'Core: Launched by Apex or another flow'],
      ['Child_Flow.start', 'Child flow: Launched by Apex or another flow'],
      ['Convert.start', 'Convert: Convert__e received'],
      ['Reparent_Tasks.start', 'Reparent tasks: Reparent_Tasks__e received'],
    ]);
    expect(diagram.flows.filter((flow) => flow.launch).map((flow) => [flow.from, flow.to])).toEqual([
      ['Core.Child', 'Child_Flow.start'],
      ['Core.Publish', 'Convert.start'],
      ['Core.Reparent', 'Reparent_Tasks.start'],
      ['Core.Reparent', 'Child_Flow.start'],
    ]);
    expect(reviewDiagram(diagram)).toMatchObject({ problems: [], warnings: [] });
  });
});
