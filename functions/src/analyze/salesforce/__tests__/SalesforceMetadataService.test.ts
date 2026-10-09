import JSZip from 'jszip';

import {
  buildSalesforceAuditReport,
  buildSalesforceApexDrilldowns,
  buildSalesforceDependencyMap,
  buildSalesforceDocumentationTopics,
  buildSalesforceEvidenceLedger,
  buildSalesforceExecutiveBrief,
  buildSalesforceFeatureReferenceMap,
  buildSalesforceFeatureReadinessBrief,
  buildSalesforceFlowDrilldowns,
  buildSalesforceInsightPacketSummary,
  buildSalesforceInventory,
  buildSalesforceMetadataIndex,
  buildSalesforceRemediationBacklog,
  buildSalesforceSignalEvidence,
  buildSalesforceStakeholderArtifactPlan,
  buildSalesforceTroubleshootingBrief,
  buildSalesforceWorkbenchSummary,
  buildSalesforceVsCodeHandoff,
  findSalesforceComponent,
  loadSalesforceSourceFiles,
  loadSalesforceWorkspaceInputs,
  searchSalesforceMetadata,
  type SalesforceInsightPacket,
  type SalesforceSourceFile,
} from '../SalesforceMetadataService';

// The sandbox filesystem is injected on the server (the browser mocked the sandboxService singleton).
const mockSandboxService = {
  listFiles: jest.fn(),
  readFile: jest.fn(),
  mountFile: jest.fn(),
};

function sourceFile(path: string, content: string): SalesforceSourceFile {
  return {
    path,
    content,
    sizeBytes: new TextEncoder().encode(content).byteLength,
  };
}

const FIXTURE_FILES: SalesforceSourceFile[] = [
  sourceFile('force-app/main/default/classes/CaseService.cls', `
public without sharing class CaseService {
  public static void escalate(List<Case> casesToProcess) {
    for (Case c : casesToProcess) {
      List<Case> existingCases = [SELECT Id, Escalation_Status__c FROM Case WHERE Id = :c.Id];
      c.Escalation_Status__c = 'Escalated';
      update c;
    }
    System.debug('Escalation complete');
  }
}
`),
  sourceFile('force-app/main/default/classes/UnrelatedTest.cls', `
@IsTest
private class UnrelatedTest {
  @IsTest
  static void coversSomething() {
    Case c = new Case(Subject = 'Test');
    insert c;
  }
}
`),
  sourceFile('force-app/main/default/triggers/CaseTrigger.trigger', `
trigger CaseTrigger on Case (before insert, before update) {
  CaseService.escalate(Trigger.new);
}
`),
  sourceFile('force-app/main/default/lwc/caseEscalation/caseEscalation.js', `
import { LightningElement } from 'lwc';
import ESCALATION_STATUS from '@salesforce/schema/Case.Escalation_Status__c';
import escalate from '@salesforce/apex/CaseService.escalate';

export default class CaseEscalation extends LightningElement {
  statusField = ESCALATION_STATUS;
}
`),
  sourceFile('force-app/main/default/objects/Case/Case.object-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Case</label>
  <pluralLabel>Cases</pluralLabel>
</CustomObject>
`),
  sourceFile('force-app/main/default/objects/Case/fields/Escalation_Status__c.field-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
  <fullName>Escalation_Status__c</fullName>
  <label>Escalation Status</label>
  <type>Text</type>
</CustomField>
`),
  sourceFile('force-app/main/default/objects/Case/validationRules/Require_Status.validationRule-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
  <fullName>Require_Status</fullName>
  <active>true</active>
  <errorConditionFormula>ISBLANK(Escalation_Status__c)</errorConditionFormula>
</ValidationRule>
`),
  sourceFile('force-app/main/default/flows/Case_Escalation.flow-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <status>Active</status>
  <processType>AutoLaunchedFlow</processType>
  <recordUpdates>
    <name>Update_Case</name>
    <object>Case</object>
  </recordUpdates>
</Flow>
`),
  sourceFile('force-app/main/default/permissionsets/AdminAccess.permissionset-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
  <userPermissions>
    <enabled>true</enabled>
    <name>ModifyAllData</name>
  </userPermissions>
  <objectPermissions>
    <allowDelete>true</allowDelete>
    <modifyAllRecords>true</modifyAllRecords>
    <object>Case</object>
  </objectPermissions>
</PermissionSet>
`),
  sourceFile('force-app/main/default/settings/Case.settings-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<CaseSettings xmlns="http://soap.sforce.com/2006/04/metadata">
  <enableCaseFeed>true</enableCaseFeed>
</CaseSettings>
  `),
];

function makeInsightPacket(): SalesforceInsightPacket {
  return {
    runId: '2026-05-07-case-audit',
    rootPath: '.symposium/salesforce-insights/2026-05-07-case-audit',
    sourcePath: '/uploads/project/.symposium/salesforce-insights/2026-05-07-case-audit/manifest.json',
    manifest: {
      version: 1,
      kind: 'salesforce_insight_packet',
      createdAt: '2026-05-07T14:30:00.000Z',
      source: {
        workspaceName: 'case-service-org',
        gitBranch: 'feature/case-escalation',
        gitCommit: 'abc1234',
      },
      agentSession: {
        agent: 'codex',
        toolsUsed: ['salesforce_mcp', 'sfdx', 'static_analysis'],
      },
      goals: ['Assess Case escalation modernization risk'],
      files: {
        findings: 'findings.json',
        evidence: 'evidence.md',
        transcript: 'transcript.md',
      },
    },
    findings: [
      {
        id: 'case-escalation-blast-radius',
        title: 'Case escalation automation has a wide blast radius',
        severity: 'high',
        audienceImpact: 'product',
        summary: 'The local agent found CaseService, CaseTrigger, and the active Case escalation flow all touching escalation state.',
        affectedPaths: [
          'force-app/main/default/classes/CaseService.cls',
          'force-app/main/default/flows/Case_Escalation.flow-meta.xml',
        ],
        affectedComponents: ['CaseTrigger'],
        evidenceRefs: ['evidence.md#case-escalation-blast-radius'],
        documentationRefs: ['https://help.salesforce.com/s/articleView?id=sf.flow_ref_elements_actions_update_records.htm&type=5'],
        recommendedNextStep: 'Align product and engineering on a staged Case escalation remediation plan before implementation.',
        confidence: 0.86,
      },
    ],
    evidence: '# Evidence\n\n<a id="case-escalation-blast-radius"></a>\nCaseService and Case_Escalation both update Case escalation state.',
    transcript: 'Agent transcript summary.',
    warnings: [],
  };
}

describe('SalesforceMetadataService', () => {
  beforeEach(() => {
    mockSandboxService.listFiles.mockReset();
    mockSandboxService.readFile.mockReset();
  });

  it('recursively loads uploaded Salesforce source folders from the sandbox', async () => {
    mockSandboxService.listFiles.mockImplementation(async (path: string) => {
      if (path === '/uploads') {
        return [{ name: 'project', path: '/uploads/project', isDirectory: true }];
      }
      if (path === '/uploads/project') {
        return [
          { name: 'CaseService.cls', path: '/uploads/project/force-app/main/default/classes/CaseService.cls', isDirectory: false },
        ];
      }
      return [];
    });
    mockSandboxService.readFile.mockResolvedValue(
      new TextEncoder().encode('public with sharing class CaseService {}').buffer
    );

    const files = await loadSalesforceSourceFiles(mockSandboxService);

    expect(mockSandboxService.readFile).toHaveBeenCalledWith('/uploads/project/force-app/main/default/classes/CaseService.cls');
    expect(files).toEqual([
      expect.objectContaining({
        path: 'project/force-app/main/default/classes/CaseService.cls',
        content: 'public with sharing class CaseService {}',
        sourcePath: '/uploads/project/force-app/main/default/classes/CaseService.cls',
      }),
    ]);
  });

  it('loads ZIP metadata from an exact byte view returned by the sandbox', async () => {
    const zip = new JSZip();
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    const zipBytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
    const padded = new Uint8Array(zipBytes.byteLength + 32);
    padded.set(zipBytes, 16);

    mockSandboxService.readFile.mockResolvedValue(
      padded.subarray(16, 16 + zipBytes.byteLength)
    );

    const files = await loadSalesforceSourceFiles(mockSandboxService, ['/uploads/QA-salesforce-metadata.zip']);

    expect(files).toEqual([
      expect.objectContaining({
        path: 'force-app/main/default/classes/CaseService.cls',
        content: 'public with sharing class CaseService {}',
      }),
    ]);
  });

  it('discovers and validates agent insight packets from uploaded ZIP metadata', async () => {
    const packet = makeInsightPacket();
    const zip = new JSZip();
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/2026-05-07-case-audit/manifest.json', JSON.stringify(packet.manifest));
    zip.file('.symposium/salesforce-insights/2026-05-07-case-audit/findings.json', JSON.stringify({ findings: packet.findings }));
    zip.file('.symposium/salesforce-insights/2026-05-07-case-audit/evidence.md', packet.evidence);
    zip.file('.symposium/salesforce-insights/2026-05-07-case-audit/transcript.md', packet.transcript!);
    const zipBytes = await zip.generateAsync({ type: 'arraybuffer' });

    mockSandboxService.readFile.mockResolvedValue(zipBytes);

    const inputs = await loadSalesforceWorkspaceInputs(mockSandboxService, ['/uploads/case-audit.zip']);

    expect(inputs.sourceFiles).toEqual([
      expect.objectContaining({ path: 'force-app/main/default/classes/CaseService.cls' }),
    ]);
    expect(inputs.invalidInsightPackets).toEqual([]);
    expect(inputs.insightPackets).toEqual([
      expect.objectContaining({
        runId: '2026-05-07-case-audit',
        sourcePath: '/uploads/case-audit.zip',
        findings: [
          expect.objectContaining({
            id: 'case-escalation-blast-radius',
            audienceImpact: 'product',
          }),
        ],
        evidence: expect.stringContaining('CaseService and Case_Escalation'),
      }),
    ]);
  });

  it('imports packets with missing gitBranch as degraded provenance warnings', async () => {
    const packet = makeInsightPacket();
    const manifest = {
      ...packet.manifest,
      source: {
        ...packet.manifest.source,
        gitBranch: '',
      },
    };
    const zip = new JSZip();
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/2026-05-07-case-audit/manifest.json', JSON.stringify(manifest));
    zip.file('.symposium/salesforce-insights/2026-05-07-case-audit/findings.json', JSON.stringify({ findings: packet.findings }));
    zip.file('.symposium/salesforce-insights/2026-05-07-case-audit/evidence.md', packet.evidence);
    const zipBytes = await zip.generateAsync({ type: 'arraybuffer' });

    mockSandboxService.readFile.mockResolvedValue(zipBytes);

    const inputs = await loadSalesforceWorkspaceInputs(mockSandboxService, ['/uploads/case-audit.zip']);

    expect(inputs.invalidInsightPackets).toEqual([]);
    expect(inputs.insightPackets).toEqual([
      expect.objectContaining({
        runId: '2026-05-07-case-audit',
        manifest: expect.objectContaining({
          source: expect.objectContaining({ gitBranch: 'unknown' }),
        }),
        warnings: expect.arrayContaining([
          'source.gitBranch is missing or empty; imported with gitBranch set to "unknown".',
        ]),
        findings: expect.arrayContaining([
          expect.objectContaining({ id: 'case-escalation-blast-radius' }),
        ]),
      }),
    ]);
  });

  it('imports packet v2 runtime evidence into the evidence ledger and question-specific docs topics', async () => {
    const query = 'Assess EmailMessage ReplyToEmailMessageId and Email-to-Salesforce routing risk';
    const manifest = {
      ...makeInsightPacket().manifest,
      version: 2,
      createdAt: '2026-05-12T15:00:00.000Z',
      goals: [query],
    };
    const findings = {
      findings: [
        {
          id: 'emailmessage-runtime-check',
          title: 'EmailMessage triggerability requires runtime verification',
          severity: 'high',
          audienceImpact: 'engineering',
          summary: 'A read-only org query checked whether EmailMessage is triggerable before using it as a routing source.',
          affectedPaths: ['force-app/main/default/classes/EmailRoutingService.cls'],
          affectedComponents: ['EmailRoutingService'],
          evidenceRefs: ['evidence.md#emailmessage-runtime-check'],
          sourceType: 'soql',
          observedAt: '2026-05-12T15:01:00.000Z',
          evidenceClaims: [
            {
              claimId: 'emailmessage-triggerable-query',
              claim: 'EmailMessage triggerability was checked through EntityDefinition rather than inferred from source metadata.',
              sourceType: 'soql',
              confidence: 0.9,
              observedAt: '2026-05-12T15:01:00.000Z',
              evidenceRefs: ['evidence.md#emailmessage-runtime-check'],
              queryRefs: ['q-emailmessage-entitydefinition'],
              limitations: ['This proves the queried org response only at the recorded timestamp.'],
            },
          ],
          runtimeQueries: [
            {
              id: 'q-emailmessage-entitydefinition',
              tool: 'salesforce_mcp',
              query: "SELECT IsTriggerable, QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = 'EmailMessage'",
              resultShape: 'setup object rows',
              rowCount: 1,
              rows: [{ QualifiedApiName: 'EmailMessage', IsTriggerable: false }],
              executedAt: '2026-05-12T15:01:00.000Z',
              apiVersion: '66.0',
            },
          ],
          describeResults: [
            {
              id: 'describe-emailmessage',
              objectName: 'EmailMessage',
              fieldNames: ['ReplyToEmailMessageId', 'ThreadIdentifier', 'RelatedToId'],
              observedAt: '2026-05-12T15:01:00.000Z',
              apiVersion: '66.0',
            },
          ],
          recommendedNextStep: 'Treat source metadata as insufficient for EmailMessage runtime behavior and cite the query evidence.',
          confidence: 0.9,
        },
      ],
    };
    const zip = new JSZip();
    zip.file('force-app/main/default/classes/EmailRoutingService.cls', `
public with sharing class EmailRoutingService {
  public static List<EmailMessage> loadMessages(Set<Id> ids) {
    return [SELECT Id, ReplyToEmailMessageId, ThreadIdentifier, RelatedToId, Headers FROM EmailMessage WHERE Id IN :ids];
  }
}
`);
    zip.file('.symposium/salesforce-insights/email-runtime/manifest.json', JSON.stringify(manifest));
    zip.file('.symposium/salesforce-insights/email-runtime/findings.json', JSON.stringify(findings));
    zip.file('.symposium/salesforce-insights/email-runtime/evidence.md', '# Evidence\n<a id="emailmessage-runtime-check"></a>');
    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const inputs = await loadSalesforceWorkspaceInputs(mockSandboxService, ['/uploads/email-runtime.zip']);
    const index = buildSalesforceMetadataIndex(inputs.sourceFiles, ['fixture'], inputs.insightPackets, query);
    const ledger = JSON.parse(buildSalesforceEvidenceLedger(index));
    const docTopics = JSON.parse(buildSalesforceDocumentationTopics(index, query));
    const featureMap = JSON.parse(buildSalesforceFeatureReferenceMap(index));
    const apexDrilldowns = JSON.parse(buildSalesforceApexDrilldowns(index));

    expect(inputs.invalidInsightPackets).toEqual([]);
    expect(index.importedFindings[0]).toMatchObject({
      id: 'emailmessage-runtime-check',
      sourceType: 'soql',
      runtimeQueries: expect.arrayContaining([
        expect.objectContaining({ id: 'q-emailmessage-entitydefinition' }),
      ]),
    });
    expect(ledger.summary.bySourceType.soql).toBeGreaterThanOrEqual(2);
    expect(ledger.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'soql',
        queryRefs: expect.arrayContaining(['q-emailmessage-entitydefinition']),
      }),
    ]));
    expect(docTopics.lookupArgs.topics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'emailmessage-object-reference' }),
      expect.objectContaining({ id: 'emailmessage-threading-fields' }),
      expect.objectContaining({ id: 'email-to-salesforce' }),
    ]));
    expect(featureMap.features).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'emailmessage',
        runtimeVerificationRequired: true,
      }),
    ]));
    expect(apexDrilldowns.drilldowns[0].emailReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ token: 'EmailMessage' }),
      expect.objectContaining({ token: 'ReplyToEmailMessageId' }),
    ]));
  });

  it('rejects invalid agent insight packets without importing their findings', async () => {
    mockSandboxService.listFiles.mockImplementation(async (path: string) => {
      if (path === '/uploads') {
        return [{ name: 'project', path: '/uploads/project', isDirectory: true }];
      }
      if (path === '/uploads/project') {
        return [{ name: '.symposium', path: '/uploads/project/.symposium', isDirectory: true }];
      }
      if (path === '/uploads/project/.symposium') {
        return [{ name: 'salesforce-insights', path: '/uploads/project/.symposium/salesforce-insights', isDirectory: true }];
      }
      if (path === '/uploads/project/.symposium/salesforce-insights') {
        return [{ name: 'bad-run', path: '/uploads/project/.symposium/salesforce-insights/bad-run', isDirectory: true }];
      }
      if (path === '/uploads/project/.symposium/salesforce-insights/bad-run') {
        return [
          { name: 'manifest.json', path: '/uploads/project/.symposium/salesforce-insights/bad-run/manifest.json', isDirectory: false },
          { name: 'findings.json', path: '/uploads/project/.symposium/salesforce-insights/bad-run/findings.json', isDirectory: false },
          { name: 'evidence.md', path: '/uploads/project/.symposium/salesforce-insights/bad-run/evidence.md', isDirectory: false },
        ];
      }
      return [];
    });
    mockSandboxService.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('manifest.json')) {
        return new TextEncoder().encode(JSON.stringify({ version: 1, kind: 'wrong_kind' })).buffer;
      }
      if (path.endsWith('findings.json')) {
        return new TextEncoder().encode(JSON.stringify({ findings: [] })).buffer;
      }
      return new TextEncoder().encode('# Evidence').buffer;
    });

    const inputs = await loadSalesforceWorkspaceInputs(mockSandboxService);

    expect(inputs.insightPackets).toEqual([]);
    expect(inputs.invalidInsightPackets).toEqual([
      expect.objectContaining({
        runId: 'bad-run',
        errors: expect.arrayContaining([
          'kind must be salesforce_insight_packet.',
          'createdAt must be a non-empty string.',
        ]),
      }),
    ]);
  });

  it('normalizes common Salesforce metadata into components and dependencies', () => {
    const index = buildSalesforceMetadataIndex(FIXTURE_FILES, ['fixture']);
    const byName = new Map(index.components.map((component) => [component.name, component]));

    expect(index.sourceSummary.fileCount).toBe(FIXTURE_FILES.length);
    expect(index.sourceSummary.componentCount).toBe(10);
    expect(index.sourceSummary.recognizedTypes).toMatchObject({
      apex_class: 2,
      apex_trigger: 1,
      custom_field: 1,
      custom_object: 1,
      flow: 1,
      lwc_component: 1,
      permission_set: 1,
      unknown: 1,
      validation_rule: 1,
    });

    expect(byName.get('CaseService')).toMatchObject({
      type: 'apex_class',
      path: 'force-app/main/default/classes/CaseService.cls',
    });
    expect(byName.get('Case.Escalation_Status__c')).toMatchObject({
      type: 'custom_field',
      objectName: 'Case',
    });
    expect(findSalesforceComponent(index, 'CaseTrigger')).toMatchObject({
      type: 'apex_trigger',
    });
    expect(searchSalesforceMetadata(index, 'Escalation_Status')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Case.Escalation_Status__c' }),
      ])
    );

    expect(index.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceName: 'CaseService', targetName: 'Case', reference: 'Case' }),
        expect.objectContaining({ sourceName: 'CaseTrigger', targetName: 'CaseService', reference: 'CaseService' }),
        expect.objectContaining({ sourceName: 'caseEscalation', targetName: 'CaseService', reference: 'CaseService' }),
        expect.objectContaining({ sourceName: 'caseEscalation', targetName: 'Case.Escalation_Status__c', reference: 'Case.Escalation_Status__c' }),
      ])
    );
  });

  it('flags MVP audit risks for Apex, permissions, tests, and flows', () => {
    const index = buildSalesforceMetadataIndex(FIXTURE_FILES, ['fixture']);
    const riskTitles = index.risks.map((risk) => risk.title);

    expect(riskTitles).toEqual(expect.arrayContaining([
      'SOQL query inside loop',
      'DML inside loop',
      'Runs without sharing',
      'Debug logging left in Apex',
      'No obvious companion test class',
      'Test lacks assertions',
      'Active flow lacks visible fault paths',
      'Autolaunched flow mutates records',
      'Powerful permission enabled: ModifyAllData',
      'Broad object-level data access',
    ]));
    expect(index.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Powerful permission enabled: ModifyAllData',
        severity: 'critical',
        ruleId: 'permissions.powerful-permission',
        docTopicIds: expect.arrayContaining(['permissions-least-privilege', 'field-level-security-object-permissions']),
      }),
      expect.objectContaining({
        title: 'SOQL query inside loop',
        severity: 'high',
        ruleId: 'apex.soql-in-loop',
        evidenceSpans: expect.arrayContaining([
          expect.objectContaining({ path: 'force-app/main/default/classes/CaseService.cls' }),
        ]),
        evidenceDetails: expect.arrayContaining([
          expect.objectContaining({ kind: 'apex_block', type: 'loop' }),
        ]),
      }),
      expect.objectContaining({
        title: 'Active flow lacks visible fault paths',
        path: 'force-app/main/default/flows/Case_Escalation.flow-meta.xml',
        ruleId: 'flow.active-no-fault-path',
        evidenceDetails: expect.arrayContaining([
          expect.objectContaining({
            kind: 'flow_element',
            type: 'recordUpdates',
            attributes: expect.objectContaining({ elementName: 'Update_Case' }),
          }),
        ]),
      }),
    ]));
    expect(index.documentationTopics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'apex-governor-limits' }),
      expect.objectContaining({ id: 'apex-crud-fls-user-mode' }),
      expect.objectContaining({ id: 'apex-async-processing' }),
      expect.objectContaining({ id: 'soql-query-selectivity' }),
      expect.objectContaining({ id: 'flow-fault-paths' }),
      expect.objectContaining({ id: 'flow-tests-debugging' }),
      expect.objectContaining({ id: 'permissions-least-privilege' }),
      expect.objectContaining({ id: 'field-level-security-object-permissions' }),
      expect.objectContaining({ id: 'object-field-modeling' }),
      expect.objectContaining({ id: 'validation-rules-formulas' }),
    ]));
  });

  it('joins imported agent evidence to metadata components by path and component name', () => {
    const index = buildSalesforceMetadataIndex(FIXTURE_FILES, ['fixture'], [makeInsightPacket()]);
    const inventory = JSON.parse(buildSalesforceInventory(index));
    const dependencyMap = JSON.parse(buildSalesforceDependencyMap(index));
    const insightSummary = JSON.parse(buildSalesforceInsightPacketSummary(index));
    const stakeholderPlan = JSON.parse(buildSalesforceStakeholderArtifactPlan(index));
    const remediationBacklog = JSON.parse(buildSalesforceRemediationBacklog(index));
    const signalEvidence = JSON.parse(buildSalesforceSignalEvidence(index));
    const evidenceLedger = JSON.parse(buildSalesforceEvidenceLedger(index));
    const flowDrilldowns = JSON.parse(buildSalesforceFlowDrilldowns(index));
    const apexDrilldowns = JSON.parse(buildSalesforceApexDrilldowns(index));
    const featureMap = JSON.parse(buildSalesforceFeatureReferenceMap(index));
    const workbenchSummary = JSON.parse(buildSalesforceWorkbenchSummary(index));
    const docTopics = JSON.parse(buildSalesforceDocumentationTopics(index, 'Explain Case escalation modernization risk'));
    const executiveBrief = buildSalesforceExecutiveBrief(index, 'Explain Case escalation modernization risk');
    const report = buildSalesforceAuditReport(index);

    expect(index.sourceSummary.insightPacketCount).toBe(1);
    expect(index.sourceSummary.importedFindingCount).toBe(1);
    expect(index.importedFindings[0]).toMatchObject({
      id: 'case-escalation-blast-radius',
      matchedComponentNames: expect.arrayContaining(['CaseService', 'CaseTrigger', 'Case_Escalation']),
      matchedComponents: expect.arrayContaining([
        expect.objectContaining({
          name: 'CaseService',
          type: 'apex_class',
          path: 'force-app/main/default/classes/CaseService.cls',
        }),
      ]),
      unmatchedAffectedPaths: [],
    });
    expect(inventory.importedFindings[0].matchedComponentNames).toEqual(
      expect.arrayContaining(['CaseService', 'CaseTrigger', 'Case_Escalation'])
    );
    expect(dependencyMap.importedFindingEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'insight:2026-05-07-case-audit:case-escalation-blast-radius',
          relationship: 'flags',
        }),
      ])
    );
    expect(insightSummary.validPackets[0]).toMatchObject({
      runId: '2026-05-07-case-audit',
      findingCount: 1,
    });
    expect(insightSummary.schema.keyPaths.importedFindings).toBe('importedFindings[]');
    expect(insightSummary.componentMappings[0]).toMatchObject({
      findingId: 'case-escalation-blast-radius',
      matchedComponents: expect.arrayContaining([
        expect.objectContaining({ name: 'CaseService' }),
      ]),
    });
    expect(stakeholderPlan.visualArtifacts).toHaveProperty('executiveImpactBrief');
    expect(stakeholderPlan.visualArtifacts).toHaveProperty('dependencyAtlas');
    expect(stakeholderPlan.visualArtifacts).toHaveProperty('changeImpactMap');
    expect(stakeholderPlan.visualArtifacts).toHaveProperty('processAutomationMap');
    expect(stakeholderPlan.visualArtifacts).toHaveProperty('engineeringRemediationRoadmap');
    expect(stakeholderPlan.artifactLimits).toMatchObject({
      dependencyAtlasNodesIncluded: expect.any(Number),
      dependencyAtlasEdgesIncluded: expect.any(Number),
    });
    expect(remediationBacklog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'metadata_audit',
        signalId: expect.any(String),
        ruleId: expect.any(String),
        componentType: expect.any(String),
        evidenceSpans: expect.any(Array),
        evidenceDetails: expect.any(Array),
        triageAction: expect.any(String),
      }),
    ]));
    expect(signalEvidence.summary).toMatchObject({
      signalCount: index.risks.length,
      signalsWithDrilldownDetails: expect.any(Number),
    });
    expect(signalEvidence.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'flow.active-no-fault-path',
        evidenceDetails: expect.arrayContaining([
          expect.objectContaining({ kind: 'flow_element' }),
        ]),
      }),
    ]));
    expect(evidenceLedger.summary).toMatchObject({
      claimCount: expect.any(Number),
      agentSummaryClaimsRequireVerification: 1,
    });
    expect(evidenceLedger.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'agent_summary',
        limitations: expect.arrayContaining([
          expect.stringContaining('did not include raw SOQL/describe evidence'),
        ]),
      }),
    ]));
    expect(flowDrilldowns.drilldowns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentName: 'Case_Escalation',
        mutatingElementsWithoutFaults: expect.arrayContaining([
          expect.objectContaining({ type: 'recordUpdates' }),
        ]),
      }),
    ]));
    expect(apexDrilldowns.drilldowns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentName: 'CaseService',
        sharingMode: 'without sharing',
      }),
    ]));
    expect(featureMap.features).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'service-cloud-standard-objects',
        docTopicIds: expect.arrayContaining(['service-cloud-admin-setup', 'standard-object-reference-sales-service']),
      }),
      expect.objectContaining({
        id: 'flow-metadata-edge-cases',
        docTopicIds: expect.arrayContaining(['flow-metadata-edge-cases']),
      }),
    ]));
    expect(workbenchSummary.docsVerification).toMatchObject({
      status: 'pending_docs_lookup',
      documentationTopicCount: expect.any(Number),
    });
    expect(workbenchSummary.artifactMap).toMatchObject({
      signalEvidence: 'salesforce-signal-evidence.json',
      evidenceLedger: 'salesforce-evidence-ledger.json',
      flowDrilldowns: 'salesforce-flow-drilldowns.json',
      remediationBacklog: 'salesforce-remediation-backlog.json',
    });
    expect(docTopics.lookupArgs.topics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'user-goal-context' }),
      expect.objectContaining({ id: 'salesforce-release-updates' }),
      expect.objectContaining({
        id: expect.stringMatching(/^imported-doc-ref-https-help-salesforce-com/),
        category: 'imported_evidence',
      }),
    ]));
    expect(executiveBrief).toContain('Imported agent evidence: 1');
    expect(report).toContain('## Imported Agent Evidence');
  });

  it('builds a troubleshooting brief from pasted Flow and Apex error context', () => {
    const index = buildSalesforceMetadataIndex(FIXTURE_FILES, ['fixture'], [makeInsightPacket()]);
    const brief = buildSalesforceTroubleshootingBrief(
      index,
      'FLOW_ELEMENT_ERROR in Case_Escalation. Apex DmlException at Class.CaseService: line 4. End users cannot escalate Cases in production.',
    );

    expect(brief).toContain('# Salesforce Troubleshooting Brief');
    expect(brief).toContain('Flow or process automation failure');
    expect(brief).toContain('Apex exception or trigger/class failure');
    expect(brief).toContain('CaseService');
    expect(brief).toContain('Case_Escalation');
    expect(brief).toContain('DML inside loop');
    expect(brief).toContain('Case escalation automation has a wide blast radius');
    expect(brief).toContain('Read-Only Diagnostic Path');
  });

  it('matches packet affected paths with workspace prefixes, metadata companions, and component folders', () => {
    const packet = makeInsightPacket();
    packet.findings[0] = {
      ...packet.findings[0],
      affectedPaths: [
        'QA/force-app/main/default/classes/CaseService.cls-meta.xml',
        'QA/force-app/main/default/lwc/caseEscalation',
      ],
      affectedComponents: [],
    };

    const index = buildSalesforceMetadataIndex(FIXTURE_FILES, ['fixture'], [packet]);

    expect(index.importedFindings[0]).toMatchObject({
      matchedComponentNames: expect.arrayContaining(['CaseService', 'caseEscalation']),
      unmatchedAffectedPaths: [],
    });
  });

  it('generates durable audit and handoff artifacts with source citations and safety boundary', () => {
    const index = buildSalesforceMetadataIndex(FIXTURE_FILES, ['fixture']);
    const inventory = JSON.parse(buildSalesforceInventory(index));
    const dependencyMap = JSON.parse(buildSalesforceDependencyMap(index));
    const report = buildSalesforceAuditReport(index);
    const readinessBrief = buildSalesforceFeatureReadinessBrief(index, 'Plan Case escalation hardening');
    const handoff = buildSalesforceVsCodeHandoff(index, 'Plan Case escalation hardening');

    expect(inventory.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'CaseService', path: 'force-app/main/default/classes/CaseService.cls' }),
    ]));
    expect(dependencyMap.edges.length).toBeGreaterThanOrEqual(4);
    expect(report).toContain('# Salesforce Metadata Audit');
    expect(report).toContain('CaseService, force-app/main/default/classes/CaseService.cls');
    expect(report).toContain('Product Boundary');
    expect(readinessBrief).toContain('Feature or change goal: Plan Case escalation hardening');
    expect(handoff.safetyBoundary).toContain('Read-only metadata audit');
    expect(handoff.remediationTasks[0]).toMatchObject({
      acceptanceCriteria: expect.arrayContaining([
        'No direct production org mutation is performed from this handoff.',
      ]),
    });
    expect(handoff.vscodePrompts.codex).toContain('do not deploy directly to production');
    expect({
      reportHeadings: report.split('\n').filter((line) => line.startsWith('##')),
      sourceCitations: index.risks.slice(0, 3).map((risk) => `${risk.title} @ ${risk.path}`),
      handoffBoundary: handoff.safetyBoundary,
      handoffPromptBoundary: handoff.vscodePrompts.claudeCode.includes('no org mutation or deployment commands'),
    }).toMatchInlineSnapshot(`
{
  "handoffBoundary": "Read-only metadata audit. No code edits, deployments, destructive org operations, or production mutations are performed.",
  "handoffPromptBoundary": true,
  "reportHeadings": [
    "## Component Inventory",
    "## Highest Priority Static Signals",
    "### CRITICAL",
    "### HIGH",
    "### MEDIUM",
    "### LOW",
    "## Product Boundary",
  ],
  "sourceCitations": [
    "Powerful permission enabled: ModifyAllData @ force-app/main/default/permissionsets/AdminAccess.permissionset-meta.xml",
    "Broad object-level data access @ force-app/main/default/permissionsets/AdminAccess.permissionset-meta.xml",
    "SOQL query inside loop @ force-app/main/default/classes/CaseService.cls",
  ],
}
`);
  });
});
