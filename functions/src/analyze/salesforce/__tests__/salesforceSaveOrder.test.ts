import { diagramMetadata, isSaveOrder, reviewDiagram } from '../../contract/services/analyze/diagrams/diagramFile';
import type { SalesforceSourceFile } from '../SalesforceMetadataService';
import { parseSalesforceFlow } from '../salesforceFlowDiagram';
import { buildSalesforceSaveOrders, orderRecordTriggeredFlows, readTriggerHeader } from '../salesforceSaveOrder';

const ZIP = '/uploads/qa.zip';
const D = 'force-app/main/default';

function zipped(path: string, content: string): SalesforceSourceFile {
  return { path: `${D}/${path}`, content, sizeBytes: content.length, sourcePath: ZIP };
}

function recordFlow(name: string, options: { timing: 'RecordBeforeSave' | 'RecordAfterSave' | 'RecordBeforeDelete'; saves?: string; order?: number; status?: string; object?: string; extra?: string }): SalesforceSourceFile {
  return zipped(`flows/${name}.flow-meta.xml`, `<Flow><label>${name.replace(/_/g, ' ')}</label><processType>AutoLaunchedFlow</processType><status>${options.status ?? 'Active'}</status>${options.order !== undefined ? `<triggerOrder>${options.order}</triggerOrder>` : ''}<start><object>${options.object ?? 'Lead'}</object>${options.saves ? `<recordTriggerType>${options.saves}</recordTriggerType>` : ''}<triggerType>${options.timing}</triggerType>${options.extra ?? ''}</start></Flow>`);
}

function leadWorkspace(): SalesforceSourceFile[] {
  return [
    zipped('objects/Lead/Lead.object-meta.xml', '<CustomObject><sharingModel>Private</sharingModel></CustomObject>'),
    recordFlow('New_Lead_Set_Up', { timing: 'RecordBeforeSave', saves: 'CreateAndUpdate', order: 1500 }),
    recordFlow('Lead_Validation', { timing: 'RecordBeforeSave', saves: 'CreateAndUpdate', order: 500 }),
    recordFlow('Set_Final_Source', { timing: 'RecordBeforeSave', saves: 'Create' }),
    recordFlow('Date_Contacted', { timing: 'RecordBeforeSave', saves: 'CreateAndUpdate' }),
    recordFlow('Old_Flow', { timing: 'RecordBeforeSave', saves: 'Create', status: 'Obsolete' }),
    recordFlow('Before_Delete', { timing: 'RecordBeforeDelete' }),
    recordFlow('Route_to_CRC_Queue', { timing: 'RecordAfterSave', saves: 'CreateAndUpdate', order: 10 }),
    recordFlow('Create_LeadShare', { timing: 'RecordAfterSave', saves: 'Update', order: 1600, extra: '<scheduledPaths><connector><targetReference>X</targetReference></connector><pathType>AsyncAfterCommit</pathType></scheduledPaths>' }),
    recordFlow('Account_Flow', { timing: 'RecordAfterSave', saves: 'Create', object: 'Account' }),
    zipped('triggers/LeadTrigger.trigger', '// trigger Fake on Account (before insert)\ntrigger LeadTrigger on Lead (before insert, before update, after insert) {}'),
    zipped('triggers/hed__TDTM_Lead.trigger', '(hidden)'),
    zipped('triggers/hed__TDTM_Contact.trigger', '(hidden)'),
    zipped('objects/Lead/validationRules/Reason_Disqualified.validationRule-meta.xml', '<ValidationRule><fullName>Reason_Disqualified</fullName><active>true</active><errorConditionFormula>ISPICKVAL(Status, "Disqualified")</errorConditionFormula><errorMessage>Pick a reason</errorMessage></ValidationRule>'),
    zipped('objects/Lead/validationRules/Off.validationRule-meta.xml', '<ValidationRule><fullName>Off</fullName><active>false</active></ValidationRule>'),
    zipped('duplicateRules/Lead.Block_Dupes.duplicateRule-meta.xml', '<DuplicateRule><actionOnInsert>Block</actionOnInsert><actionOnUpdate>Allow</actionOnUpdate><isActive>true</isActive><masterLabel>Block dupes</masterLabel></DuplicateRule>'),
    zipped('duplicateRules/Lead.Inactive.duplicateRule-meta.xml', '<DuplicateRule><isActive>false</isActive><masterLabel>Inactive</masterLabel></DuplicateRule>'),
    zipped('assignmentRules/Lead.assignmentRules-meta.xml', '<AssignmentRules><assignmentRule><fullName>Web to Lead Assignment</fullName><active>true</active><ruleEntry><assignedTo>Q</assignedTo></ruleEntry><ruleEntry><assignedTo>R</assignedTo></ruleEntry></assignmentRule></AssignmentRules>'),
    zipped('workflows/Lead.workflow-meta.xml', '<Workflow><fieldUpdates><fullName>Status_Up</fullName></fieldUpdates><rules><fullName>No Test</fullName><active>true</active><triggerType>onCreateOnly</triggerType><actions><name>Status_Up</name><type>FieldUpdate</type></actions></rules><rules><fullName>Off rule</fullName><active>false</active></rules></Workflow>'),
    zipped('objects/Account/fields/Lead_Count__c.field-meta.xml', '<CustomField><fullName>Lead_Count__c</fullName><type>Summary</type><summaryForeignKey>Lead.Account__c</summaryForeignKey><summaryOperation>count</summaryOperation></CustomField>'),
    zipped('sharingRules/Lead.sharingRules-meta.xml', '<SharingRules><sharingCriteriaRules><fullName>R03D09</fullName></sharingCriteriaRules><sharingCriteriaRules><fullName>R06D04</fullName></sharingCriteriaRules><sharingOwnerRules><fullName>Owner_Rule</fullName></sharingOwnerRules></SharingRules>'),
  ];
}

describe('what runs when a record saves', () => {
  it('draws the object\'s automation between the platform\'s steps, in Salesforce\'s order', () => {
    const { results, notFound } = buildSalesforceSaveOrders(leadWorkspace(), ['lead', 'Nope__c']);
    expect(notFound).toEqual(['Nope__c']);
    const [lead] = results;
    expect(lead.diagram).toMatchObject({ kind: 'process_flow', platform: 'salesforce', title: 'What runs when a Lead saves' });
    expect(lead.diagram.nodes.map((node) => [node.label, node.elementType ?? node.type])).toEqual([
      ['Lead saved', 'start'],
      ['System validation', 'step'],
      ['Lead Validation', 'flow'],
      ['Date Contacted', 'flow'],
      ['Set Final Source (create only)', 'flow'],
      ['New Lead Set Up', 'flow'],
      ['LeadTrigger', 'apexTrigger'],
      ['System validation again', 'step'],
      ['Reason_Disqualified', 'validationRule'],
      ['Block dupes', 'duplicateRule'],
      ['Saved, not committed', 'step'],
      ['LeadTrigger (create only)', 'apexTrigger'],
      ['Assignment rule: Web to Lead Assignment', 'assignmentRule'],
      ['No Test (create only)', 'workflowRule'],
      ['Route to CRC Queue', 'flow'],
      ['Create LeadShare (update only)', 'flow'],
      ['Roll-up Account.Lead_Count__c', 'rollUpSummary'],
      ['2 criteria-based sharing rules', 'sharingRule'],
      ['Committed', 'step'],
      ['Create LeadShare: after the commit', 'flow'],
      ['Done', 'end'],
    ]);
    expect(lead.automationCount).toBe(15);
    expect(lead.hiddenTriggers).toEqual(['hed__TDTM_Lead']);
    expect(lead.inactiveFlows).toEqual(['Old_Flow']);
    expect(lead.deleteFlows).toEqual(['Before_Delete']);
    expect(reviewDiagram(lead.diagram)).toMatchObject({ problems: [], warnings: [] });
    // The Outputs card knows it for a save order and counts the same automation.
    expect(isSaveOrder(lead.diagram)).toBe(true);
    expect(diagramMetadata(lead.diagram, []).saveOrder).toEqual({ automations: 15 });
    // One line from start to done.
    expect(lead.diagram.flows).toHaveLength(lead.diagram.nodes.length - 1);
  });

  it('says what each step does: trigger order, entry, a blocking duplicate rule, a field update that saves again', () => {
    const [lead] = buildSalesforceSaveOrders(leadWorkspace(), ['Lead']).results;
    const byLabel = new Map(lead.diagram.nodes.map((node) => [node.label, node]));
    expect(byLabel.get('Lead Validation')).toMatchObject({ description: 'Before-save flow. Trigger order 500.', source: `${ZIP}#${D}/flows/Lead_Validation.flow-meta.xml` });
    expect(byLabel.get('Date Contacted')!.description).toContain('No trigger order: runs after orders 1–1000 and before 1001–2000, by activation date');
    expect(byLabel.get('Block dupes')!.description).toBe('On create: block; on update: allow. A blocked duplicate stops the save: nothing after this runs.');
    expect(byLabel.get('No Test (create only)')!.description).toContain('Its field updates save the record again: before and after update triggers run once more');
    expect(byLabel.get('Reason_Disqualified')!.description).toBe('Error: "Pick a reason". Fails when: ISPICKVAL(Status, "Disqualified")');
    expect(byLabel.get('Create LeadShare: after the commit')!.description).toBe('After the commit: Run asynchronously.');
    expect(lead.diagram.summary).toBe('15 pieces of the org\'s automation in the order Salesforce runs them on a save. Package triggers with hidden source can\'t be placed: hed__TDTM_Lead may run on Lead.');
  });

  it('orders record-triggered flows 1–1000, then those without an order, then 1001–2000, ties by API name', () => {
    const flow = (name: string, order?: number) => parseSalesforceFlow(name, recordFlow(name, { timing: 'RecordAfterSave', saves: 'Create', order }))!;
    expect(orderRecordTriggeredFlows([flow('Late', 2000), flow('B'), flow('A'), flow('Mid', 1000), flow('Tie_B', 10), flow('Tie_A', 10), flow('After', 1001)]).map((entry) => entry.apiName))
      .toEqual(['Tie_A', 'Tie_B', 'Mid', 'A', 'B', 'After', 'Late']);
  });

  it('reads a trigger\'s object and events from its header, past comments', () => {
    expect(readTriggerHeader('/* trigger X on Case (after delete) */\ntrigger AccountTrigger on Account (after update, before insert) {}')).toEqual({ object: 'Account', events: ['after update', 'before insert'] });
    expect(readTriggerHeader('(hidden)')).toBeNull();
  });

  it('still draws the platform\'s steps for an object with no automation', () => {
    const [contact] = buildSalesforceSaveOrders([zipped('objects/Contact/Contact.object-meta.xml', '<CustomObject/>')], ['Contact']).results;
    expect(contact.diagram.nodes.map((node) => node.label)).toEqual(['Contact saved', 'System validation', 'System validation again', 'Saved, not committed', 'Committed', 'Done']);
    expect(contact.diagram.title).toBe('What runs when a Contact saves');
    expect(buildSalesforceSaveOrders([zipped('objects/Account/Account.object-meta.xml', '<CustomObject/>')], ['Account']).results[0].diagram.title).toBe('What runs when an Account saves');
  });
});
