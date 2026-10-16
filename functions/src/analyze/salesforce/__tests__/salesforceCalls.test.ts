import type { SalesforceSourceFile } from '../SalesforceMetadataService';
import { buildSalesforceCalls } from '../salesforceCalls';

const D = 'force-app/main/default';

function file(path: string, content: string): SalesforceSourceFile {
  return { path: `${D}/${path}`, content, sizeBytes: content.length, sourcePath: '/uploads/qa.zip' };
}

function calls(files: SalesforceSourceFile[]) {
  const ids = new Map<SalesforceSourceFile, number>();
  const found = buildSalesforceCalls(files, (source) => {
    if (!ids.has(source)) ids.set(source, ids.size);
    return ids.get(source)!;
  });
  return found.map(({ from, to, how, line }) => `${from} ${how} ${to} @${line}`);
}

describe('buildSalesforceCalls', () => {
  it('follows the lead conversion hops: subflow, Apex action, a published event and the flow it starts', () => {
    const found = calls([
      file('flows/Conversion_3.flow-meta.xml', '<Flow>\n<subflows><name>Core</name><flowName>Conversion_2</flowName></subflows>\n</Flow>'),
      file('flows/Conversion_1.flow-meta.xml', '<Flow>\n<actionCalls><name>Match</name><actionName>LeadSearchMatchInvocable</actionName><actionType>apex</actionType></actionCalls>\n</Flow>'),
      file('flows/Conversion_2.flow-meta.xml', '<Flow>\n\n<recordCreates><name>Publish</name><object>Convert_Lead__e</object></recordCreates>\n</Flow>'),
      file('flows/Conversion_4.flow-meta.xml', '<Flow>\n<actionCalls><actionName>ConvertLeadsInvocable</actionName><actionType>apex</actionType></actionCalls>\n<start><object>Convert_Lead__e</object><triggerType>PlatformEvent</triggerType></start>\n</Flow>'),
      file('classes/LeadSearchMatchInvocable.cls', 'public class LeadSearchMatchInvocable {}'),
      file('classes/ConvertLeadsInvocable.cls', 'public class ConvertLeadsInvocable {}'),
    ]);
    expect(found).toEqual([
      'event:Convert_Lead__e starts flow:Conversion_4 @3',
      'flow:Conversion_1 apex apex:LeadSearchMatchInvocable @2',
      'flow:Conversion_2 publishes event:Convert_Lead__e @3',
      'flow:Conversion_3 subflow flow:Conversion_2 @2',
      'flow:Conversion_4 apex apex:ConvertLeadsInvocable @2',
    ]);
  });

  it('reads Apex: the classes it names, the events it publishes, the flows it runs, and triggers on events', () => {
    const found = calls([
      file('classes/LeadService.cls', 'public class LeadService {\n  // LeadHelper in a comment is not a call\n  void go() { LeadHelper.run(); EventBus.publish(new Reparent__e()); Flow.Interview.Enroll x; }\n}'),
      file('classes/LeadHelper.cls', 'public class LeadHelper { public static void run() {} }'),
      file('classes/Hidden.cls', '(hidden)'),
      file('triggers/ReparentTrigger.trigger', 'trigger ReparentTrigger on Reparent__e (after insert) {\n  LeadService.go();\n}'),
      file('flows/Enroll.flow-meta.xml', '<Flow/>'),
    ]);
    expect(found).toEqual([
      'apex:LeadService calls apex:LeadHelper @3',
      'apex:LeadService publishes event:Reparent__e @3',
      'apex:LeadService runs flow:Enroll @3',
      'event:Reparent__e starts trigger:ReparentTrigger @1',
      'trigger:ReparentTrigger calls apex:LeadService @2',
    ]);
  });

  it('reads components, actions and pages: what each imports, runs or hosts, only where the workspace has it', () => {
    const found = calls([
      file('lwc/tourPicker/tourPicker.js', "import getTours from '@salesforce/apex/TourController.getTours';\nimport x from '@salesforce/apex/Missing.call';"),
      file('aura/legacyTour/legacyTour.cmp', '<aura:component controller="TourController"></aura:component>'),
      file('pages/TourPage.page', '<apex:page controller="TourController" extensions="Missing, TourExtension"></apex:page>'),
      file('classes/TourController.cls', 'public class TourController {}'),
      file('classes/TourExtension.cls', 'public class TourExtension {}'),
      file('quickActions/Lead.Pre_Enrollment.quickAction-meta.xml', '<QuickAction>\n<flowDefinition>Pre_Enrollment</flowDefinition>\n</QuickAction>'),
      file('quickActions/Lead.Pick_Tour.quickAction-meta.xml', '<QuickAction><lightningWebComponent>tourPicker</lightningWebComponent></QuickAction>'),
      file('flows/Pre_Enrollment.flow-meta.xml', '<Flow><screens><fields><extensionName>c:tourPicker</extensionName></fields></screens></Flow>'),
      file('flexipages/Lead_Page.flexipage-meta.xml', '<FlexiPage>\n<componentName>c:tourPicker</componentName>\n<value>Lead.Pre_Enrollment</value>\n<componentName>Mogli_SMS:Send</componentName>\n</FlexiPage>'),
    ]);
    expect(found).toEqual([
      'flexipage:Lead_Page hosts lightningComponent:tourPicker @2',
      'flexipage:Lead_Page hosts quickAction:Lead.Pre_Enrollment @3',
      'flow:Pre_Enrollment hosts lightningComponent:tourPicker @1',
      'lightningComponent:legacyTour calls apex:TourController @1',
      'lightningComponent:tourPicker imports apex:TourController @1',
      'quickAction:Lead.Pick_Tour runs lightningComponent:tourPicker @1',
      'quickAction:Lead.Pre_Enrollment runs flow:Pre_Enrollment @2',
      'visualforce:TourPage calls apex:TourController @1',
      'visualforce:TourPage calls apex:TourExtension @1',
    ]);
  });
});
