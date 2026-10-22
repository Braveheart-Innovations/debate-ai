import type { SalesforceSourceFile } from '../SalesforceMetadataService';
import { buildSalesforceFlowTable, FLOW_TABLE_COLUMNS, salesforceFlowTableCsv, summarizeSalesforceFlowTable } from '../salesforceFlowTable';

const ZIP = '/uploads/qa.zip';

function flowFile(name: string, body: string): SalesforceSourceFile {
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<Flow xmlns="http://soap.sforce.com/2006/04/metadata">\n${body}\n</Flow>`;
  return { path: `force-app/main/default/flows/${name}.flow-meta.xml`, content, sizeBytes: content.length, sourcePath: ZIP };
}

const connector = (to: string) => `<connector><targetReference>${to}</targetReference></connector>`;
const fault = (to: string) => `<faultConnector><targetReference>${to}</targetReference></faultConnector>`;

/** Before a Lead saves: stamp two fields on the record. */
const STAMP = flowFile('Lead_Stamp', `
  <label>Lead stamp</label><processType>AutoLaunchedFlow</processType><status>Active</status><triggerOrder>100</triggerOrder>
  <start>${connector('Stamp')}<object>Lead</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordBeforeSave</triggerType>
    <filters><field>LeadSource</field><operator>IsNull</operator><value><booleanValue>true</booleanValue></value></filters></start>
  <assignments><name>Stamp</name><label>Stamp</label>
    <assignmentItems><assignToReference>$Record.LeadSource</assignToReference><operator>Assign</operator><value><stringValue>Web</stringValue></value></assignmentItems>
    <assignmentItems><assignToReference>$Record.Status</assignToReference><operator>Assign</operator><value><stringValue>New</stringValue></value></assignmentItems>
  </assignments>`);

/**
 * After a Lead saves: update the Lead itself (with a fault path), loop over its
 * opportunities and update each in the loop (no fault path), run a subflow, call
 * Apex, publish an event, and run asynchronously too.
 */
const ROUTE = flowFile('Lead_Route', `
  <label>Lead route</label><processType>AutoLaunchedFlow</processType><status>Active</status>
  <variables><name>loopOpp</name><dataType>SObject</dataType><isCollection>false</isCollection><objectType>Opportunity</objectType></variables>
  <variables><name>opps</name><dataType>SObject</dataType><isCollection>true</isCollection><objectType>Opportunity</objectType></variables>
  <start>${connector('Set_Owner')}<object>Lead</object><recordTriggerType>CreateAndUpdate</recordTriggerType><triggerType>RecordAfterSave</triggerType>
    <scheduledPaths><connector><targetReference>Notify</targetReference></connector><label>Notify later</label><pathType>AsyncAfterCommit</pathType></scheduledPaths></start>
  <recordUpdates><name>Set_Owner</name><label>Set owner</label>${connector('Get_Opps')}${fault('Log')}<inputReference>$Record</inputReference></recordUpdates>
  <recordLookups><name>Get_Opps</name><label>Get opps</label>${connector('Each_Opp')}<object>Opportunity</object></recordLookups>
  <loops><name>Each_Opp</name><label>Each opp</label><collectionReference>Get_Opps</collectionReference>
    <nextValueConnector><targetReference>Mark</targetReference></nextValueConnector><noMoreValuesConnector><targetReference>Sub</targetReference></noMoreValuesConnector></loops>
  <assignments><name>Mark</name><label>Mark</label>${connector('Save_Opp')}
    <assignmentItems><assignToReference>loopOpp.StageName</assignToReference><operator>Assign</operator><value><stringValue>Contacted</stringValue></value></assignmentItems></assignments>
  <recordUpdates><name>Save_Opp</name><label>Save opp</label>${connector('Each_Opp')}<inputReference>loopOpp</inputReference></recordUpdates>
  <subflows><name>Sub</name><label>Sub</label>${connector('Match')}<flowName>Create_Note_Subflow</flowName></subflows>
  <actionCalls><name>Match</name><label>Match</label>${connector('Publish')}<actionName>LeadSearchMatchInvocable</actionName><actionType>apex</actionType></actionCalls>
  <recordCreates><name>Publish</name><label>Publish</label><object>Convert_Lead__e</object>
    <inputAssignments><field>Lead_Id__c</field><value><elementReference>$Record.Id</elementReference></value></inputAssignments></recordCreates>
  <actionCalls><name>Notify</name><label>Notify</label><actionName>Lead.Welcome</actionName><actionType>emailAlert</actionType></actionCalls>
  <recordCreates><name>Log</name><label>Log</label><object>Error_Log__c</object>
    <inputAssignments><field>Message__c</field><value><elementReference>$Flow.FaultMessage</elementReference></value></inputAssignments></recordCreates>`);

/** After an Opportunity saves: updates the record that triggered it, by Id. */
const BY_ID = flowFile('Opp_By_Id', `
  <label>Opp by id</label><processType>AutoLaunchedFlow</processType><status>Active</status>
  <start>${connector('Update_It')}<object>Opportunity</object><recordTriggerType>Update</recordTriggerType><triggerType>RecordAfterSave</triggerType>
    <filters><field>StageName</field><operator>EqualTo</operator><value><stringValue>Prospecting</stringValue></value></filters></start>
  <recordUpdates><name>Update_It</name><label>Update it</label><object>Opportunity</object>
    <filters><field>Id</field><operator>EqualTo</operator><value><elementReference>$Record.Id</elementReference></value></filters>
    <inputAssignments><field>Next_Step__c</field><value><stringValue>Call</stringValue></value></inputAssignments></recordUpdates>`);

const EVENT = flowFile('On_Convert', `
  <label>On convert</label><processType>AutoLaunchedFlow</processType><status>Active</status>
  <start><object>Convert_Lead__e</object><triggerType>PlatformEvent</triggerType></start>`);
const SCREEN = flowFile('Lead_Screen', '<label>Lead screen</label><processType>Flow</processType><status>Active</status>');
const OLD = flowFile('Old_Flow', '<label>Old</label><processType>AutoLaunchedFlow</processType><status>Obsolete</status>');
const PACKAGE = flowFile('hed__Package_Flow', '<label>Package</label><processType>AutoLaunchedFlow</processType><status>Active</status>');
const BROKEN = { path: 'force-app/main/default/flows/Broken.flow-meta.xml', content: '<Flow><label>Broken</label', sizeBytes: 26, sourcePath: ZIP };

describe('buildSalesforceFlowTable', () => {
  const table = buildSalesforceFlowTable([STAMP, ROUTE, BY_ID, EVENT, SCREEN, OLD, PACKAGE, BROKEN]);
  const row = (name: string) => table.rows.find((entry) => entry.name === name)!;

  it('has a row for each Flow the org owns, not an installed package\'s', () => {
    expect(table.rows.map((entry) => entry.name)).toEqual(['Lead_Route', 'Lead_Screen', 'Lead_Stamp', 'Old_Flow', 'On_Convert', 'Opp_By_Id']);
  });

  it('reads a before-save flow: its trigger, order, entry criteria, and the fields it sets on the record', () => {
    expect(row('Lead_Stamp')).toMatchObject({
      status: 'Active',
      triggerType: 'RecordBeforeSave',
      object: 'Lead',
      recordTriggerType: 'Create',
      triggerOrder: 100,
      entryCriteria: 'Runs when LeadSource is blank.',
      faultCapable: 0,
      fieldsWritten: ['$Record.LeadSource', '$Record.Status'],
      updatesOwnRecord: false,
      path: 'force-app/main/default/flows/Lead_Stamp.flow-meta.xml',
    });
  });

  it('reads an after-save flow: record operations, loops, fault paths, what it calls and publishes, what it writes', () => {
    expect(row('Lead_Route')).toMatchObject({
      triggerOrder: null,
      lookups: 1,
      creates: 2,
      updates: 2,
      deletes: 0,
      recordOperationsInLoops: 1,
      // Set_Owner (with its fault path), Get_Opps, Save_Opp, Match, Publish, Notify, Log.
      faultCapable: 7,
      withFaultPath: 1,
      subflows: ['Create_Note_Subflow'],
      apexActions: ['LeadSearchMatchInvocable'],
      otherActions: ['emailAlert:Lead.Welcome'],
      eventsPublished: ['Convert_Lead__e'],
      scheduledPaths: ['async: Notify later'],
      fieldsWritten: ['Convert_Lead__e.Lead_Id__c', 'Error_Log__c.Message__c', 'Opportunity.StageName'],
      updatesOwnRecord: true,
    });
  });

  it('counts an update of the triggering record by its Id as updating its own record', () => {
    expect(row('Opp_By_Id')).toMatchObject({ updatesOwnRecord: true, fieldsWritten: ['$Record.Next_Step__c'] });
  });

  it('names the files it could not read', () => {
    expect(table.unreadable).toEqual(['Broken']);
  });

  it('writes a CSV with a header row, lists joined by "; " and quoted where needed', () => {
    const csv = salesforceFlowTableCsv(table.rows);
    const [header, ...lines] = csv.trim().split('\n');
    expect(header).toBe(FLOW_TABLE_COLUMNS.join(','));
    expect(lines).toHaveLength(table.rows.length);
    expect(csv).toContain(',Convert_Lead__e.Lead_Id__c; Error_Log__c.Message__c; Opportunity.StageName,');
    expect(csv).toContain(',"Runs when StageName = ""Prospecting"".",');
  });

  it('sums the table up: active flows by object and phase, the rest by kind, and the totals', () => {
    expect(summarizeSalesforceFlowTable(table)).toEqual([
      'Flows the org owns: 6, 5 active.',
      'Active record-triggered flows by object:',
      '- Lead: before-save 1, after-save 1',
      '- Opportunity: after-save 1',
      'Other active flows: platform event 1 (Convert_Lead__e 1), screen 1.',
      'Not active: 1 (Obsolete 1).',
      'Across the active flows: 8 elements that can take a fault path, 1 with one (before-save flows have none); 1 record operations inside a loop; 2 after-save flows update the record that triggered them.',
      'Not read (the XML didn\'t parse): Broken.',
    ]);
  });
});
