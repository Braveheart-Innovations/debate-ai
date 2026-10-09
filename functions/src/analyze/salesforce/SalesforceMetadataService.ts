/**
 * Moved from symposium-ai-web src/services/salesforce/SalesforceMetadataService.ts
 * (Phase 3 Step 5), logic unchanged: the sandbox filesystem is injected
 * (SandboxFiles) where the browser imported the sandboxService singleton.
 */
import JSZip from 'jszip';
import {
  getSalesforceInsightPacketPathInfo,
  isSalesforceInsightPacketPath,
  isSalesforceMetadataSourcePath,
  normalizeSalesforcePath,
  type SalesforceInsightPacketPathInfo,
} from '../contract/services/salesforce/SalesforceMetadataPaths';
import type { SalesforceDocumentationTopic } from './SalesforceDocsLookupService';
import type { SandboxFileInfo, SandboxFiles } from '../engine/tools/sandboxFiles';

export type { SalesforceComponentType } from '../contract/services/salesforce/componentTypes';
import type { SalesforceComponentType } from '../contract/services/salesforce/componentTypes';

export type SalesforceRiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SalesforceSourceFile {
  path: string;
  content: string;
  sizeBytes: number;
  sourcePath?: string;
}

export interface SalesforceMetadataReference {
  kind: 'apex' | 'object' | 'field' | 'flow' | 'permission' | 'unknown';
  name: string;
  evidence?: string;
}

export interface SalesforceMetadataComponent {
  id: string;
  name: string;
  type: SalesforceComponentType;
  path: string;
  paths: string[];
  objectName?: string;
  apiVersion?: string;
  sizeBytes: number;
  lineCount: number;
  references: SalesforceMetadataReference[];
  tags: string[];
}

export interface SalesforceMetadataDependency {
  sourceId: string;
  sourceName: string;
  sourceType: SalesforceComponentType;
  targetId: string;
  targetName: string;
  targetType: SalesforceComponentType;
  reference: string;
  relationship: 'references' | 'uses' | 'configures' | 'guards';
}

export interface SalesforceSignalEvidenceDetail {
  kind: 'apex_block' | 'flow_element' | 'metadata_element';
  label: string;
  type?: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  attributes?: Record<string, string | number | boolean | string[]>;
}

export interface SalesforceMetadataRisk {
  id: string;
  ruleId: string;
  severity: SalesforceRiskSeverity;
  category: 'security' | 'maintainability' | 'performance' | 'testability' | 'automation' | 'deployment';
  componentId: string;
  componentName: string;
  componentType: SalesforceComponentType;
  path: string;
  title: string;
  detail: string;
  recommendation: string;
  evidence?: string;
  confidence: number;
  evidenceSpans: Array<{
    path: string;
    startLine: number;
    endLine: number;
    snippet: string;
  }>;
  evidenceDetails: SalesforceSignalEvidenceDetail[];
  docTopicIds: string[];
  limitations: string[];
  triageAction: 'review' | 'verify_with_docs' | 'verify_in_org' | 'plan_remediation';
}

export type SalesforceInsightAudienceImpact = 'executive' | 'product' | 'engineering' | 'security' | 'operations';
export type SalesforceInsightAgent = 'codex' | 'claude_code' | 'other';
export type SalesforceEvidenceSourceType =
  | 'metadata'
  | 'soql'
  | 'describe'
  | 'docs'
  | 'agent_summary'
  | 'inference'
  | 'runtime_unverified';

export interface SalesforcePacketEvidenceClaim {
  claimId: string;
  claim: string;
  sourceType: SalesforceEvidenceSourceType;
  confidence?: number;
  observedAt?: string;
  evidenceRefs: string[];
  queryRefs: string[];
  limitations: string[];
}

export interface SalesforcePacketRuntimeQuery {
  id: string;
  tool?: string;
  query: string;
  resultShape?: string;
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
  executedAt?: string;
  observedAt?: string;
  apiVersion?: string;
  warnings?: string[];
}

export interface SalesforcePacketDescribeResult {
  id: string;
  objectName: string;
  fields?: Array<Record<string, unknown>>;
  fieldNames?: string[];
  apiVersion?: string;
  observedAt?: string;
  warnings?: string[];
}

export interface SalesforceEvidenceLedgerClaim {
  claimId: string;
  claim: string;
  sourceType: SalesforceEvidenceSourceType;
  confidence: number;
  observedAt: string;
  artifactRefs: string[];
  evidenceRefs: string[];
  queryRefs: string[];
  limitations: string[];
  relatedComponentIds: string[];
  relatedComponentNames: string[];
  parentFindingId?: string;
  packetRunId?: string;
  ruleId?: string;
}

export interface SalesforceFlowDrilldown {
  componentId: string;
  componentName: string;
  path: string;
  status?: string;
  processType?: string;
  elements: SalesforceSignalEvidenceDetail[];
  mutatingElementsWithoutFaults: SalesforceSignalEvidenceDetail[];
  subflowReferences: string[];
  relatedRiskIds: string[];
  limitations: string[];
}

export interface SalesforceApexDrilldown {
  componentId: string;
  componentName: string;
  componentType: SalesforceComponentType;
  path: string;
  sharingMode?: 'with sharing' | 'without sharing' | 'inherited sharing' | 'unspecified';
  methodSpans: Array<{
    name: string;
    startLine: number;
    endLine: number;
    snippet: string;
  }>;
  evidenceDetails: SalesforceSignalEvidenceDetail[];
  emailReferences: Array<{
    token: string;
    startLine: number;
    snippet: string;
  }>;
  relatedRiskIds: string[];
  limitations: string[];
}

export interface SalesforceFeatureReferenceMap {
  version: 1;
  generatedAt: string;
  query?: string;
  features: Array<{
    id: string;
    label: string;
    category: 'object' | 'field' | 'feature' | 'integration' | 'apex' | 'metadata';
    reasons: string[];
    matchedComponents: Array<{
      id: string;
      name: string;
      type: SalesforceComponentType;
      path: string;
      references: SalesforceMetadataReference[];
    }>;
    importedFindingIds: string[];
    docTopicIds: string[];
    runtimeVerificationRequired: boolean;
  }>;
}

export interface SalesforceInsightPacketManifest {
  version: 1 | 2;
  kind: 'salesforce_insight_packet';
  createdAt: string;
  source: {
    workspaceName: string;
    gitBranch: string;
    gitCommit: string | null;
  };
  agentSession: {
    agent: SalesforceInsightAgent;
    toolsUsed: string[];
  };
  goals: string[];
  files: {
    findings: string;
    evidence: string;
    transcript?: string;
  };
}

export interface SalesforceInsightPacketFinding {
  id: string;
  title: string;
  severity: SalesforceRiskSeverity;
  audienceImpact: SalesforceInsightAudienceImpact;
  summary: string;
  affectedPaths: string[];
  affectedComponents: string[];
  evidenceRefs: string[];
  recommendedNextStep: string;
  confidence: number;
  sourceType?: SalesforceEvidenceSourceType;
  observedAt?: string;
  evidenceClaims?: SalesforcePacketEvidenceClaim[];
  runtimeQueries?: SalesforcePacketRuntimeQuery[];
  describeResults?: SalesforcePacketDescribeResult[];
  documentationRefs?: string[];
}

export interface SalesforceInsightPacket {
  runId: string;
  rootPath: string;
  sourcePath?: string;
  manifest: SalesforceInsightPacketManifest;
  findings: SalesforceInsightPacketFinding[];
  evidence: string;
  transcript?: string;
  warnings: string[];
}

export interface SalesforceInvalidInsightPacket {
  runId?: string;
  rootPath?: string;
  sourcePath?: string;
  errors: string[];
}

export interface SalesforceImportedInsightFinding extends SalesforceInsightPacketFinding {
  sourceType: SalesforceEvidenceSourceType;
  packetRunId: string;
  packetRootPath: string;
  packetSourcePath?: string;
  matchedComponentIds: string[];
  matchedComponentNames: string[];
  matchedComponents: Array<{
    id: string;
    name: string;
    type: SalesforceComponentType;
    path: string;
    paths: string[];
  }>;
  unmatchedAffectedPaths: string[];
}

export interface SalesforceMetadataIndex {
  generatedAt: string;
  sourceSummary: {
    fileCount: number;
    componentCount: number;
    totalBytes: number;
    recognizedTypes: Partial<Record<SalesforceComponentType, number>>;
    inputPaths: string[];
    insightPacketCount: number;
    importedFindingCount: number;
    safetyBoundary: string;
  };
  components: SalesforceMetadataComponent[];
  dependencies: SalesforceMetadataDependency[];
  risks: SalesforceMetadataRisk[];
  documentationTopics: SalesforceDocumentationTopic[];
  evidenceLedger: SalesforceEvidenceLedgerClaim[];
  flowDrilldowns: SalesforceFlowDrilldown[];
  apexDrilldowns: SalesforceApexDrilldown[];
  featureReferenceMap: SalesforceFeatureReferenceMap;
  insightPackets: Array<{
    runId: string;
    rootPath: string;
    sourcePath?: string;
    createdAt: string;
    workspaceName: string;
    gitBranch: string;
    gitCommit: string | null;
    agent: SalesforceInsightAgent;
    toolsUsed: string[];
    goals: string[];
    findingCount: number;
    warnings: string[];
  }>;
  importedFindings: SalesforceImportedInsightFinding[];
}

export interface SalesforceWorkspaceInputs {
  sourceFiles: SalesforceSourceFile[];
  insightPackets: SalesforceInsightPacket[];
  invalidInsightPackets: SalesforceInvalidInsightPacket[];
}

export interface SalesforceMetadataHandoff {
  version: 1;
  generatedAt: string;
  safetyBoundary: string;
  summary: string;
  targetComponents: Array<{
    id: string;
    name: string;
    type: SalesforceComponentType;
    paths: string[];
    reason: string;
  }>;
  remediationTasks: Array<{
    id: string;
    priority: SalesforceRiskSeverity;
    title: string;
    targetComponents: string[];
    desiredChange: string;
    acceptanceCriteria: string[];
    testGuidance: string[];
  }>;
  vscodePrompts: {
    codex: string;
    claudeCode: string;
  };
}

const MAX_SOURCE_FILES = 15000;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

const COMPONENT_TYPE_LABELS: Record<SalesforceComponentType, string> = {
  apex_class: 'Apex classes',
  apex_trigger: 'Apex triggers',
  lwc_component: 'Lightning Web Components',
  aura_component: 'Aura components',
  custom_object: 'Custom objects',
  custom_field: 'Custom fields',
  validation_rule: 'Validation rules',
  flow: 'Flows',
  permission_set: 'Permission sets',
  profile: 'Profiles',
  layout: 'Layouts',
  package_manifest: 'Package manifests',
  custom_metadata: 'Custom metadata',
  unknown: 'Other metadata',
};

const RISK_ORDER: Record<SalesforceRiskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const BASE_DOCUMENTATION_TOPICS: Record<string, Omit<SalesforceDocumentationTopic, 'componentTypes' | 'apiVersions' | 'riskSignalIds' | 'reasons'> & { reasons: string[] }> = {
  'apex-governor-limits': {
    id: 'apex-governor-limits',
    label: 'Apex governor limits and bulkification',
    query: 'Apex governor limits SOQL DML loops bulkification best practices',
    category: 'apex',
    reasons: ['Apex static signal or Apex component detected.'],
  },
  'apex-sharing-security': {
    id: 'apex-sharing-security',
    label: 'Apex sharing and record access enforcement',
    query: 'Apex with sharing without sharing inherited sharing record access security',
    category: 'security',
    reasons: ['Apex sharing or security signal detected.'],
  },
  'apex-crud-fls-user-mode': {
    id: 'apex-crud-fls-user-mode',
    label: 'Apex CRUD/FLS enforcement and user-mode data operations',
    query: 'Apex CRUD FLS user mode data operations stripInaccessible WITH SECURITY_ENFORCED Salesforce',
    category: 'security',
    reasons: ['Apex data access or security review requires CRUD/FLS grounding.'],
  },
  'apex-async-processing': {
    id: 'apex-async-processing',
    label: 'Asynchronous Apex, Queueable Apex, and Batch Apex',
    query: 'Asynchronous Apex Queueable Apex Batch Apex future scheduled limits Salesforce',
    category: 'apex',
    reasons: ['Apex automation may need async processing or limit guidance.'],
  },
  'soql-query-selectivity': {
    id: 'soql-query-selectivity',
    label: 'SOQL selectivity, query plans, and large data volumes',
    query: 'SOQL selectivity query plan large data volumes Query Plan tool Salesforce',
    category: 'apex',
    reasons: ['Apex SOQL usage requires query selectivity and large-data-volume guidance.'],
  },
  'apex-testing': {
    id: 'apex-testing',
    label: 'Apex testing data isolation and assertions',
    query: 'Apex testing seeAllData false assertions best practices Salesforce',
    category: 'testing',
    reasons: ['Apex testability signal detected.'],
  },
  'flow-fault-paths': {
    id: 'flow-fault-paths',
    label: 'Flow fault paths and error handling',
    query: 'Salesforce Flow fault paths error handling record triggered flow',
    category: 'flow',
    reasons: ['Flow automation signal detected.'],
  },
  'flow-order-recursion': {
    id: 'flow-order-recursion',
    label: 'Flow automation order and recursion control',
    query: 'Salesforce Flow order of execution recursion record updates autolaunched flow',
    category: 'flow',
    reasons: ['Flow record mutation signal detected.'],
  },
  'flow-tests-debugging': {
    id: 'flow-tests-debugging',
    label: 'Flow tests, debugging, and runtime error handling',
    query: 'Salesforce Flow tests debug flow error emails fault path troubleshooting',
    category: 'flow',
    reasons: ['Flow automation needs test/debug/error-handling documentation.'],
  },
  'permissions-least-privilege': {
    id: 'permissions-least-privilege',
    label: 'Permission set and profile least privilege',
    query: 'Salesforce permission sets profiles ModifyAllData ViewAllData least privilege',
    category: 'permissions',
    reasons: ['Permission/profile access signal detected.'],
  },
  'field-level-security-object-permissions': {
    id: 'field-level-security-object-permissions',
    label: 'Field-level security and object permission metadata',
    query: 'Salesforce field level security object permissions profile permission set Metadata API',
    category: 'permissions',
    reasons: ['Field/object permission metadata should be checked against current docs.'],
  },
  'sharing-model-rules': {
    id: 'sharing-model-rules',
    label: 'Org sharing model, sharing rules, and record visibility',
    query: 'Salesforce sharing model organization-wide defaults sharing rules role hierarchy Metadata API',
    category: 'security',
    reasons: ['Record visibility or access model context detected.'],
  },
  'lightning-security': {
    id: 'lightning-security',
    label: 'Lightning component DOM and security guidance',
    query: 'Lightning Web Components manual DOM innerHTML security Salesforce',
    category: 'lightning',
    reasons: ['Lightning DOM injection signal detected.'],
  },
  'lightning-record-pages-layouts': {
    id: 'lightning-record-pages-layouts',
    label: 'Lightning record pages, layouts, and component exposure',
    query: 'Salesforce Lightning record pages FlexiPage layouts LWC targets metadata',
    category: 'lightning',
    reasons: ['Lightning page, layout, or component exposure metadata detected.'],
  },
  'metadata-api-versioning': {
    id: 'metadata-api-versioning',
    label: 'Metadata API and component API versioning',
    query: 'Salesforce Metadata API API version support release notes',
    category: 'metadata_api',
    reasons: ['API version or package metadata detected.'],
  },
  'metadata-deploy-retrieve-source-format': {
    id: 'metadata-deploy-retrieve-source-format',
    label: 'Metadata API deploy, retrieve, and source package boundaries',
    query: 'Salesforce Metadata API deploy retrieve package xml source format deployment',
    category: 'deployment',
    reasons: ['Deployment packaging or package manifest context detected.'],
  },
  'object-field-modeling': {
    id: 'object-field-modeling',
    label: 'Custom object and field metadata modeling',
    query: 'Salesforce CustomObject CustomField metadata field types relationships object model',
    category: 'metadata_api',
    reasons: ['Custom object or field metadata detected.'],
  },
  'validation-rules-formulas': {
    id: 'validation-rules-formulas',
    label: 'Validation rules and formula behavior',
    query: 'Salesforce validation rules formulas error condition formula metadata Tooling API',
    category: 'metadata_api',
    reasons: ['Validation rule metadata detected.'],
  },
  'custom-metadata-types': {
    id: 'custom-metadata-types',
    label: 'Custom metadata types and deployable configuration',
    query: 'Salesforce custom metadata types CustomMetadata Metadata API Apex deployable configuration',
    category: 'metadata_api',
    reasons: ['Custom metadata type or record metadata detected.'],
  },
  'record-types-picklists': {
    id: 'record-types-picklists',
    label: 'Record types and picklist metadata',
    query: 'Salesforce record types picklist values value sets Metadata API',
    category: 'metadata_api',
    reasons: ['Record type or picklist metadata context detected.'],
  },
  'reports-dashboards-metadata': {
    id: 'reports-dashboards-metadata',
    label: 'Report and dashboard metadata',
    query: 'Salesforce Report Dashboard Metadata API folders report types dashboards',
    category: 'metadata_api',
    reasons: ['Report or dashboard metadata context detected.'],
  },
  'workflow-approval-processes': {
    id: 'workflow-approval-processes',
    label: 'Workflow rules and approval process metadata',
    query: 'Salesforce Workflow ApprovalProcess metadata approval process workflow rules',
    category: 'metadata_api',
    reasons: ['Workflow or approval process metadata context detected.'],
  },
  'connected-app-oauth': {
    id: 'connected-app-oauth',
    label: 'Connected apps, OAuth settings, and scopes',
    query: 'Salesforce ConnectedApp OAuth scopes callback URL metadata security',
    category: 'integration',
    reasons: ['Connected app or OAuth integration context detected.'],
  },
  'named-credentials-external-credentials': {
    id: 'named-credentials-external-credentials',
    label: 'Named credentials and external credentials for callouts',
    query: 'Salesforce named credentials external credentials Apex callouts OAuth packaging principals',
    category: 'integration',
    reasons: ['Named credential, external credential, or callout context detected.'],
  },
  'platform-events-pubsub': {
    id: 'platform-events-pubsub',
    label: 'Platform events, event bus, and Pub/Sub API',
    query: 'Salesforce platform events event bus Pub/Sub API publish subscribe allocations Apex',
    category: 'integration',
    reasons: ['Platform event, event bus, CDC, or Pub/Sub context detected.'],
  },
  'duplicate-matching-rules': {
    id: 'duplicate-matching-rules',
    label: 'Duplicate rules and matching rules',
    query: 'Salesforce DuplicateRule MatchingRule metadata duplicate management matching rules',
    category: 'metadata_api',
    reasons: ['Duplicate rule or matching rule metadata context detected.'],
  },
  'sales-cloud-admin-setup': {
    id: 'sales-cloud-admin-setup',
    label: 'Sales Cloud admin setup and data model',
    query: 'Sales Cloud setup data model accounts contacts leads opportunities campaigns forecasts territories',
    category: 'sales_cloud',
    reasons: ['Sales Cloud standard object, admin setup, or sales process context detected.'],
  },
  'service-cloud-admin-setup': {
    id: 'service-cloud-admin-setup',
    label: 'Service Cloud admin setup and case model',
    query: 'Service Cloud setup data model cases entitlements milestones knowledge queues routing',
    category: 'service_cloud',
    reasons: ['Service Cloud case, entitlement, knowledge, routing, or support process context detected.'],
  },
  'data-cloud-development': {
    id: 'data-cloud-development',
    label: 'Data Cloud development and object model',
    query: 'Salesforce Data Cloud development data lake objects data model objects DMO DLO',
    category: 'data_cloud',
    reasons: ['Data Cloud object model or development context detected.'],
  },
  'data-cloud-ingestion-query': {
    id: 'data-cloud-ingestion-query',
    label: 'Data Cloud ingestion, extraction, and metadata APIs',
    query: 'Salesforce Data Cloud ingestion API query extract metadata API data streams',
    category: 'data_cloud',
    reasons: ['Data Cloud ingestion, extraction, data stream, or query context detected.'],
  },
  'data-cloud-identity-modeling': {
    id: 'data-cloud-identity-modeling',
    label: 'Data Cloud identity resolution and data modeling',
    query: 'Salesforce Data Cloud identity resolution data model unified individual data model objects',
    category: 'data_cloud',
    reasons: ['Data Cloud identity resolution or unified profile modeling context detected.'],
  },
  'revenue-cloud-data-model': {
    id: 'revenue-cloud-data-model',
    label: 'Revenue Cloud product, pricing, quote, and order model',
    query: 'Revenue Cloud product catalog pricing quote order contract data model Salesforce',
    category: 'revenue_cloud',
    reasons: ['Revenue Cloud, quote, order, product catalog, pricing, or contract context detected.'],
  },
  'revenue-cloud-cpq-industries': {
    id: 'revenue-cloud-cpq-industries',
    label: 'Revenue Cloud CPQ and Industries Communications data model',
    query: 'Salesforce Revenue Cloud CPQ Industries CME product catalog pricing quote order',
    category: 'revenue_cloud',
    reasons: ['Revenue Cloud CPQ or Industries Communications context detected.'],
  },
  'marketing-cloud-engagement-apis': {
    id: 'marketing-cloud-engagement-apis',
    label: 'Marketing Cloud Engagement APIs and object model',
    query: 'Marketing Cloud Engagement REST SOAP API DataExtension Subscriber Journey Content API',
    category: 'marketing_cloud',
    reasons: ['Marketing Cloud Engagement API or object model context detected.'],
  },
  'marketing-cloud-growth-development': {
    id: 'marketing-cloud-growth-development',
    label: 'Marketing Cloud Growth administration and object model',
    query: 'Marketing Cloud Growth administration setup objects Salesforce developer guide',
    category: 'marketing_cloud',
    reasons: ['Marketing Cloud Growth setup or object model context detected.'],
  },
  'standard-object-reference-sales-service': {
    id: 'standard-object-reference-sales-service',
    label: 'Standard object reference for Sales and Service Cloud',
    query: 'Salesforce standard object reference Account Contact Lead Opportunity Case Task Event User Product Quote Order Contract Asset',
    category: 'object_reference',
    reasons: ['Standard Sales or Service Cloud object context detected.'],
  },
  'metadata-api-type-reference': {
    id: 'metadata-api-type-reference',
    label: 'Metadata API type reference and coverage matrix',
    query: 'Salesforce Metadata API all metadata types metadata coverage CustomObject Flow Profile PermissionSet FlexiPage Layout',
    category: 'metadata_api',
    reasons: ['Metadata type coverage, package manifest, or API-versioned metadata context detected.'],
  },
  'flow-metadata-edge-cases': {
    id: 'flow-metadata-edge-cases',
    label: 'Flow metadata edge cases, tests, and runtime settings',
    query: 'Salesforce Flow Metadata API FlowDefinition FlowSettings FlowTest record triggered autolaunched subflow edge cases',
    category: 'flow',
    reasons: ['Flow metadata, tests, settings, or runtime edge case context detected.'],
  },
  'salesforce-release-updates': {
    id: 'salesforce-release-updates',
    label: 'Salesforce release updates and current release notes',
    query: 'Salesforce release updates current release notes Spring Summer Winter',
    category: 'release',
    reasons: ['Current Salesforce documentation context is required.'],
  },
  'emailmessage-object-reference': {
    id: 'emailmessage-object-reference',
    label: 'EmailMessage object reference and supported fields',
    query: 'EmailMessage object reference fields Salesforce API',
    category: 'object_reference',
    reasons: ['EmailMessage object or email-routing context detected.'],
  },
  'emailmessage-threading-fields': {
    id: 'emailmessage-threading-fields',
    label: 'EmailMessage threading fields and header behavior',
    query: 'EmailMessage ReplyToEmailMessageId ThreadIdentifier Headers Salesforce',
    category: 'object_reference',
    reasons: ['Email threading field context detected.'],
  },
  'email-to-salesforce': {
    id: 'email-to-salesforce',
    label: 'Email-to-Salesforce behavior and enablement',
    query: 'Email-to-Salesforce setup behavior Salesforce developer documentation',
    category: 'integration',
    reasons: ['Email-to-Salesforce context detected.'],
  },
  'enhanced-email-activity-capture': {
    id: 'enhanced-email-activity-capture',
    label: 'Enhanced Email and Einstein Activity Capture behavior',
    query: 'Enhanced Email Einstein Activity Capture EmailMessage Salesforce developer documentation',
    category: 'integration',
    reasons: ['Enhanced Email or activity capture context detected.'],
  },
  'outlook-email-integration': {
    id: 'outlook-email-integration',
    label: 'Outlook/Gmail integration email logging behavior',
    query: 'Outlook Integration Gmail Integration email logging Salesforce developer documentation',
    category: 'integration',
    reasons: ['Outlook or Gmail email logging context detected.'],
  },
  'email-services': {
    id: 'email-services',
    label: 'Email Services and inbound email Apex behavior',
    query: 'Salesforce Email Services inbound email Apex EmailServicesFunction',
    category: 'integration',
    reasons: ['Email services or inbound email context detected.'],
  },
  'activity-task-relationships': {
    id: 'activity-task-relationships',
    label: 'Activity, Task, and email relationship fields',
    query: 'Salesforce Task Activity EmailMessage RelatedToId WhatId WhoId',
    category: 'object_reference',
    reasons: ['Activity, Task, or RelatedToId context detected.'],
  },
  'email-templates': {
    id: 'email-templates',
    label: 'Email template body and merge field behavior',
    query: 'Salesforce EmailTemplate Body HtmlValue merge fields API',
    category: 'metadata_api',
    reasons: ['Email template context detected.'],
  },
  'apex-email-apis': {
    id: 'apex-email-apis',
    label: 'Apex outbound email APIs',
    query: 'Apex Messaging.SingleEmailMessage sendEmail Salesforce',
    category: 'apex',
    reasons: ['Apex email API context detected.'],
  },
};

const RISK_DOC_TOPIC_IDS: Record<string, string[]> = {
  'apex.soql-in-loop': ['apex-governor-limits', 'soql-query-selectivity'],
  'apex.dml-in-loop': ['apex-governor-limits'],
  'apex.without-sharing': ['apex-sharing-security', 'apex-crud-fls-user-mode', 'sharing-model-rules'],
  'apex.no-explicit-sharing': ['apex-sharing-security', 'apex-crud-fls-user-mode', 'sharing-model-rules'],
  'apex.see-all-data': ['apex-testing'],
  'apex.system-debug': ['apex-sharing-security'],
  'apex.hard-coded-id': ['metadata-api-versioning', 'metadata-deploy-retrieve-source-format', 'metadata-api-type-reference', 'record-types-picklists', 'standard-object-reference-sales-service'],
  'apex.large-trigger': ['apex-governor-limits', 'apex-async-processing'],
  'apex.no-companion-test': ['apex-testing'],
  'apex.test-lacks-assertions': ['apex-testing'],
  'flow.active-no-fault-path': ['flow-fault-paths', 'flow-tests-debugging', 'flow-metadata-edge-cases'],
  'flow.autolaunched-mutates-records': ['flow-order-recursion', 'flow-fault-paths', 'flow-metadata-edge-cases'],
  'permissions.powerful-permission': ['permissions-least-privilege', 'field-level-security-object-permissions', 'sharing-model-rules'],
  'permissions.broad-object-access': ['permissions-least-privilege', 'field-level-security-object-permissions'],
  'lightning.manual-dom-injection': ['lightning-security', 'lightning-record-pages-layouts'],
};

function normalizePath(path: string): string {
  return normalizeSalesforcePath(path);
}

function basename(path: string): string {
  return normalizePath(path).split('/').pop() || path;
}

function stripSuffix(value: string, suffix: string): string {
  return value.toLowerCase().endsWith(suffix.toLowerCase())
    ? value.slice(0, -suffix.length)
    : value;
}

function lineCount(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function cleanXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function extractXmlTag(content: string, tagName: string): string | undefined {
  const match = content.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'));
  return match?.[1] ? cleanXml(match[1]) : undefined;
}

function extractXmlTags(content: string, tagName: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) values.push(cleanXml(match[1]));
  }
  return unique(values.filter(Boolean));
}

function isZipPath(path: string): boolean {
  return /\.zip$/i.test(path);
}

function inferMimeSafeText(data: Uint8Array<ArrayBuffer>): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(data);
}

function toExactBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> {
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return Uint8Array.from(bytes);
  }
  const buffer = data as ArrayBuffer;
  return new Uint8Array(buffer.slice(0));
}

interface SalesforceInsightPacketSourceFile extends SalesforceSourceFile {
  packetInfo: SalesforceInsightPacketPathInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

const EVIDENCE_SOURCE_TYPES: SalesforceEvidenceSourceType[] = [
  'metadata',
  'soql',
  'describe',
  'docs',
  'agent_summary',
  'inference',
  'runtime_unverified',
];

function normalizeEvidenceSourceType(value: unknown): SalesforceEvidenceSourceType | undefined {
  return typeof value === 'string' && EVIDENCE_SOURCE_TYPES.includes(value as SalesforceEvidenceSourceType)
    ? value as SalesforceEvidenceSourceType
    : undefined;
}

function normalizeConfidence(value: unknown, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return fallback;
}

function parseJsonObject(content: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function normalizePacketFileRef(path: string): string {
  return normalizePath(path)
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function requireString(record: Record<string, unknown>, key: string, errors: string[]): string {
  const value = record[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  errors.push(`${key} must be a non-empty string.`);
  return '';
}

function parseInsightPacketManifest(content: string): {
  manifest?: SalesforceInsightPacketManifest;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: Record<string, unknown>;
  try {
    raw = parseJsonObject(content, 'manifest.json');
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : 'manifest.json is not valid JSON.'],
      warnings,
    };
  }

  if (raw.version !== 1 && raw.version !== 2) errors.push('version must be 1 or 2.');
  if (raw.kind !== 'salesforce_insight_packet') errors.push('kind must be salesforce_insight_packet.');

  const createdAt = requireString(raw, 'createdAt', errors);
  if (createdAt && Number.isNaN(Date.parse(createdAt))) {
    errors.push('createdAt must be an ISO-8601 parseable timestamp.');
  }

  const source = isRecord(raw.source) ? raw.source : null;
  if (!source) errors.push('source must be an object.');
  const workspaceName = source ? requireString(source, 'workspaceName', errors) : '';
  let gitBranch = 'unknown';
  if (source) {
    if (typeof source.gitBranch === 'string' && source.gitBranch.trim().length > 0) {
      gitBranch = source.gitBranch.trim();
    } else {
      warnings.push('source.gitBranch is missing or empty; imported with gitBranch set to "unknown".');
    }
  }
  const gitCommit = source?.gitCommit;
  if (gitCommit !== undefined && gitCommit !== null && typeof gitCommit !== 'string') {
    errors.push('source.gitCommit must be a string or null.');
  }

  const agentSession = isRecord(raw.agentSession) ? raw.agentSession : null;
  if (!agentSession) errors.push('agentSession must be an object.');
  const agent = agentSession?.agent;
  if (agent !== 'codex' && agent !== 'claude_code' && agent !== 'other') {
    errors.push('agentSession.agent must be codex, claude_code, or other.');
  }
  const toolsUsed = agentSession?.toolsUsed;
  if (!isStringArray(toolsUsed)) errors.push('agentSession.toolsUsed must be an array of strings.');

  const goals = raw.goals;
  if (!isStringArray(goals)) errors.push('goals must be an array of strings.');

  const files = isRecord(raw.files) ? raw.files : null;
  if (!files) errors.push('files must be an object.');
  const findings = files ? requireString(files, 'findings', errors) : '';
  const evidence = files ? requireString(files, 'evidence', errors) : '';
  const transcript = files?.transcript;
  if (transcript !== undefined && typeof transcript !== 'string') {
    errors.push('files.transcript must be a string when provided.');
  }

  if (errors.length > 0) return { errors, warnings };

  return {
    errors,
    warnings,
    manifest: {
      version: raw.version as 1 | 2,
      kind: 'salesforce_insight_packet',
      createdAt,
      source: {
        workspaceName,
        gitBranch,
        gitCommit: typeof gitCommit === 'string' ? gitCommit : null,
      },
      agentSession: {
        agent: agent as SalesforceInsightAgent,
        toolsUsed: toolsUsed as string[],
      },
      goals: goals as string[],
      files: {
        findings: normalizePacketFileRef(findings),
        evidence: normalizePacketFileRef(evidence),
        ...(typeof transcript === 'string' && transcript.trim().length > 0
          ? { transcript: normalizePacketFileRef(transcript) }
          : {}),
      },
    },
  };
}

function parsePacketEvidenceClaims(value: unknown, findingId: string): { claims: SalesforcePacketEvidenceClaim[]; errors: string[] } {
  if (value === undefined) return { claims: [], errors: [] };
  if (!Array.isArray(value)) return { claims: [], errors: ['evidenceClaims must be an array when provided.'] };

  const errors: string[] = [];
  const claims: SalesforcePacketEvidenceClaim[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`evidenceClaims[${index}] must be an object.`);
      return;
    }
    const claim = typeof item.claim === 'string' ? item.claim.trim() : '';
    if (!claim) {
      errors.push(`evidenceClaims[${index}].claim must be a non-empty string.`);
      return;
    }
    const sourceType = normalizeEvidenceSourceType(item.sourceType);
    if (!sourceType) {
      errors.push(`evidenceClaims[${index}].sourceType must be one of ${EVIDENCE_SOURCE_TYPES.join(', ')}.`);
      return;
    }
    const claimId = typeof item.claimId === 'string' && item.claimId.trim()
      ? item.claimId.trim()
      : `${findingId}-claim-${index + 1}`;
    claims.push({
      claimId,
      claim,
      sourceType,
      confidence: normalizeConfidence(item.confidence),
      observedAt: typeof item.observedAt === 'string' ? item.observedAt : undefined,
      evidenceRefs: isStringArray(item.evidenceRefs) ? item.evidenceRefs : [],
      queryRefs: isStringArray(item.queryRefs) ? item.queryRefs : [],
      limitations: isStringArray(item.limitations) ? item.limitations : [],
    });
  });
  return { claims, errors };
}

function parsePacketRuntimeQueries(value: unknown, findingId: string): { queries: SalesforcePacketRuntimeQuery[]; errors: string[] } {
  if (value === undefined) return { queries: [], errors: [] };
  if (!Array.isArray(value)) return { queries: [], errors: ['runtimeQueries must be an array when provided.'] };

  const errors: string[] = [];
  const queries: SalesforcePacketRuntimeQuery[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`runtimeQueries[${index}] must be an object.`);
      return;
    }
    const query = typeof item.query === 'string' ? item.query.trim() : '';
    if (!query) {
      errors.push(`runtimeQueries[${index}].query must be a non-empty string.`);
      return;
    }
    queries.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `${findingId}-query-${index + 1}`,
      tool: typeof item.tool === 'string' ? item.tool : undefined,
      query,
      resultShape: typeof item.resultShape === 'string' ? item.resultShape : undefined,
      rows: isStringRecordArray(item.rows) ? item.rows.slice(0, 50) : undefined,
      rowCount: typeof item.rowCount === 'number' && Number.isFinite(item.rowCount) ? item.rowCount : undefined,
      executedAt: typeof item.executedAt === 'string' ? item.executedAt : undefined,
      observedAt: typeof item.observedAt === 'string' ? item.observedAt : undefined,
      apiVersion: typeof item.apiVersion === 'string' ? item.apiVersion : undefined,
      warnings: isStringArray(item.warnings) ? item.warnings : undefined,
    });
  });
  return { queries, errors };
}

function parsePacketDescribeResults(value: unknown, findingId: string): { describes: SalesforcePacketDescribeResult[]; errors: string[] } {
  if (value === undefined) return { describes: [], errors: [] };
  if (!Array.isArray(value)) return { describes: [], errors: ['describeResults must be an array when provided.'] };

  const errors: string[] = [];
  const describes: SalesforcePacketDescribeResult[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`describeResults[${index}] must be an object.`);
      return;
    }
    const objectName = typeof item.objectName === 'string' ? item.objectName.trim() : '';
    if (!objectName) {
      errors.push(`describeResults[${index}].objectName must be a non-empty string.`);
      return;
    }
    describes.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `${findingId}-describe-${index + 1}`,
      objectName,
      fields: isStringRecordArray(item.fields) ? item.fields.slice(0, 250) : undefined,
      fieldNames: isStringArray(item.fieldNames) ? item.fieldNames : undefined,
      apiVersion: typeof item.apiVersion === 'string' ? item.apiVersion : undefined,
      observedAt: typeof item.observedAt === 'string' ? item.observedAt : undefined,
      warnings: isStringArray(item.warnings) ? item.warnings : undefined,
    });
  });
  return { describes, errors };
}

function inferPacketFindingSourceType(input: {
  explicitSourceType?: SalesforceEvidenceSourceType;
  evidenceClaims: SalesforcePacketEvidenceClaim[];
  runtimeQueries: SalesforcePacketRuntimeQuery[];
  describeResults: SalesforcePacketDescribeResult[];
  documentationRefs?: string[];
}): SalesforceEvidenceSourceType {
  if (input.explicitSourceType) return input.explicitSourceType;
  if (input.runtimeQueries.length > 0) return 'soql';
  if (input.describeResults.length > 0) return 'describe';
  const claimSourceType = input.evidenceClaims.find((claim) => claim.sourceType !== 'agent_summary')?.sourceType;
  if (claimSourceType) return claimSourceType;
  if ((input.documentationRefs || []).length > 0 && input.evidenceClaims.some((claim) => claim.sourceType === 'docs')) return 'docs';
  return 'agent_summary';
}

function parseInsightPacketFindings(content: string): { findings: SalesforceInsightPacketFinding[]; errors: string[] } {
  let raw: Record<string, unknown>;
  try {
    raw = parseJsonObject(content, 'findings.json');
  } catch (error) {
    return { findings: [], errors: [error instanceof Error ? error.message : 'findings.json is not valid JSON.'] };
  }

  if (!Array.isArray(raw.findings)) {
    return { findings: [], errors: ['findings.json must contain a findings array.'] };
  }

  const errors: string[] = [];
  const findings: SalesforceInsightPacketFinding[] = [];

  raw.findings.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`findings[${index}] must be an object.`);
      return;
    }

    const itemErrors: string[] = [];
    const id = requireString(item, 'id', itemErrors);
    const title = requireString(item, 'title', itemErrors);
    const summary = requireString(item, 'summary', itemErrors);
    const recommendedNextStep = requireString(item, 'recommendedNextStep', itemErrors);
    const severity = item.severity;
    if (severity !== 'critical' && severity !== 'high' && severity !== 'medium' && severity !== 'low') {
      itemErrors.push('severity must be critical, high, medium, or low.');
    }
    const audienceImpact = item.audienceImpact;
    if (
      audienceImpact !== 'executive'
      && audienceImpact !== 'product'
      && audienceImpact !== 'engineering'
      && audienceImpact !== 'security'
      && audienceImpact !== 'operations'
    ) {
      itemErrors.push('audienceImpact must be executive, product, engineering, security, or operations.');
    }
    if (!isStringArray(item.affectedPaths)) itemErrors.push('affectedPaths must be an array of strings.');
    if (!isStringArray(item.affectedComponents)) itemErrors.push('affectedComponents must be an array of strings.');
    if (!isStringArray(item.evidenceRefs)) itemErrors.push('evidenceRefs must be an array of strings.');
    if (item.documentationRefs !== undefined && !isStringArray(item.documentationRefs)) itemErrors.push('documentationRefs must be an array of strings when provided.');
    const explicitSourceType = normalizeEvidenceSourceType(item.sourceType);
    if (item.sourceType !== undefined && !explicitSourceType) itemErrors.push(`sourceType must be one of ${EVIDENCE_SOURCE_TYPES.join(', ')} when provided.`);
    if (item.observedAt !== undefined && typeof item.observedAt !== 'string') itemErrors.push('observedAt must be a string when provided.');
    const evidenceClaimsResult = parsePacketEvidenceClaims(item.evidenceClaims, id || `finding-${index}`);
    const runtimeQueriesResult = parsePacketRuntimeQueries(item.runtimeQueries, id || `finding-${index}`);
    const describeResultsResult = parsePacketDescribeResults(item.describeResults, id || `finding-${index}`);
    itemErrors.push(...evidenceClaimsResult.errors, ...runtimeQueriesResult.errors, ...describeResultsResult.errors);
    const confidence = item.confidence;
    if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
      itemErrors.push('confidence must be a number from 0 to 1.');
    }

    if (itemErrors.length > 0) {
      errors.push(...itemErrors.map((message) => `findings[${index}].${message}`));
      return;
    }

    findings.push({
      id,
      title,
      severity: severity as SalesforceRiskSeverity,
      audienceImpact: audienceImpact as SalesforceInsightAudienceImpact,
      summary,
      affectedPaths: item.affectedPaths as string[],
      affectedComponents: item.affectedComponents as string[],
      evidenceRefs: item.evidenceRefs as string[],
      recommendedNextStep,
      confidence: confidence as number,
      sourceType: inferPacketFindingSourceType({
        explicitSourceType,
        evidenceClaims: evidenceClaimsResult.claims,
        runtimeQueries: runtimeQueriesResult.queries,
        describeResults: describeResultsResult.describes,
        documentationRefs: isStringArray(item.documentationRefs) ? item.documentationRefs : undefined,
      }),
      ...(typeof item.observedAt === 'string' ? { observedAt: item.observedAt } : {}),
      ...(evidenceClaimsResult.claims.length > 0 ? { evidenceClaims: evidenceClaimsResult.claims } : {}),
      ...(runtimeQueriesResult.queries.length > 0 ? { runtimeQueries: runtimeQueriesResult.queries } : {}),
      ...(describeResultsResult.describes.length > 0 ? { describeResults: describeResultsResult.describes } : {}),
      ...(isStringArray(item.documentationRefs) ? { documentationRefs: item.documentationRefs } : {}),
    });
  });

  return { findings, errors };
}

function buildSalesforceInsightPackets(files: SalesforceInsightPacketSourceFile[]): {
  packets: SalesforceInsightPacket[];
  invalidPackets: SalesforceInvalidInsightPacket[];
} {
  const grouped = new Map<string, SalesforceInsightPacketSourceFile[]>();
  for (const file of files) {
    const list = grouped.get(file.packetInfo.rootPath) || [];
    list.push(file);
    grouped.set(file.packetInfo.rootPath, list);
  }

  const packets: SalesforceInsightPacket[] = [];
  const invalidPackets: SalesforceInvalidInsightPacket[] = [];

  for (const [rootPath, packetFiles] of grouped) {
    const firstFile = packetFiles[0];
    const byRelativePath = new Map(
      packetFiles.map((file) => [file.packetInfo.relativePath.toLowerCase(), file])
    );
    const manifestFile = byRelativePath.get('manifest.json');
    if (!manifestFile) {
      invalidPackets.push({
        runId: firstFile.packetInfo.runId,
        rootPath,
        sourcePath: firstFile.sourcePath,
        errors: ['manifest.json is required.'],
      });
      continue;
    }

    const manifestResult = parseInsightPacketManifest(manifestFile.content);
    if (!manifestResult.manifest) {
      invalidPackets.push({
        runId: firstFile.packetInfo.runId,
        rootPath,
        sourcePath: manifestFile.sourcePath,
        errors: manifestResult.errors,
      });
      continue;
    }

    const manifest = manifestResult.manifest;
    const findingsFile = byRelativePath.get(manifest.files.findings.toLowerCase());
    const evidenceFile = byRelativePath.get(manifest.files.evidence.toLowerCase());
    const transcriptFile = manifest.files.transcript
      ? byRelativePath.get(manifest.files.transcript.toLowerCase())
      : undefined;
    const errors: string[] = [];
    const warnings: string[] = [...manifestResult.warnings];

    if (!findingsFile) errors.push(`Missing findings file: ${manifest.files.findings}`);
    if (!evidenceFile) errors.push(`Missing evidence file: ${manifest.files.evidence}`);
    if (manifest.files.transcript && !transcriptFile) {
      warnings.push(`Transcript file declared but not found: ${manifest.files.transcript}`);
    }
    if (errors.length > 0) {
      invalidPackets.push({
        runId: firstFile.packetInfo.runId,
        rootPath,
        sourcePath: manifestFile.sourcePath,
        errors,
      });
      continue;
    }

    const findingsResult = parseInsightPacketFindings(findingsFile!.content);
    if (findingsResult.errors.length > 0) {
      invalidPackets.push({
        runId: firstFile.packetInfo.runId,
        rootPath,
        sourcePath: findingsFile!.sourcePath,
        errors: findingsResult.errors,
      });
      continue;
    }

    packets.push({
      runId: firstFile.packetInfo.runId,
      rootPath,
      sourcePath: manifestFile.sourcePath,
      manifest,
      findings: findingsResult.findings,
      evidence: evidenceFile!.content,
      transcript: transcriptFile?.content,
      warnings,
    });
  }

  return { packets, invalidPackets };
}

export async function loadSalesforceWorkspaceInputs(files: SandboxFiles, paths?: string[]): Promise<SalesforceWorkspaceInputs> {
  const candidatePaths = paths && paths.length > 0
    ? paths
    : await listUploadedFilePaths(files, '/uploads');

  const sourceFiles: SalesforceSourceFile[] = [];
  const packetFiles: SalesforceInsightPacketSourceFile[] = [];

  for (const path of candidatePaths) {
    if (sourceFiles.length >= MAX_SOURCE_FILES) break;

    const shouldInspectPath = isZipPath(path)
      || isSalesforceMetadataSourcePath(path)
      || isSalesforceInsightPacketPath(path);
    if (!shouldInspectPath) {
      continue;
    }

    const rawData = toExactBytes(await files.readFile(path));
    if (isZipPath(path)) {
      const zip = await JSZip.loadAsync(rawData);
      const entries = Object.values(zip.files);
      const sourceEntries = entries
        .filter((entry) => !entry.dir && isSalesforceMetadataSourcePath(entry.name))
        .slice(0, MAX_SOURCE_FILES - sourceFiles.length);

      for (const entry of sourceEntries) {
        const content = await entry.async('string');
        sourceFiles.push({
          path: normalizePath(entry.name),
          content,
          sizeBytes: new TextEncoder().encode(content).byteLength,
          sourcePath: path,
        });
      }

      for (const entry of entries.filter((entry) => !entry.dir && isSalesforceInsightPacketPath(entry.name))) {
        const packetInfo = getSalesforceInsightPacketPathInfo(entry.name);
        if (!packetInfo) continue;
        const content = await entry.async('string');
        packetFiles.push({
          path: normalizePath(entry.name),
          content,
          sizeBytes: new TextEncoder().encode(content).byteLength,
          sourcePath: path,
          packetInfo,
        });
      }
      continue;
    }

    if (rawData.byteLength > MAX_TEXT_FILE_BYTES) {
      continue;
    }

    const content = inferMimeSafeText(rawData);
    if (isSalesforceMetadataSourcePath(path)) {
      sourceFiles.push({
        path: normalizePath(path.replace(/^\/uploads\//, '')),
        content,
        sizeBytes: rawData.byteLength,
        sourcePath: path,
      });
    } else {
      const packetPath = normalizePath(path.replace(/^\/uploads\//, ''));
      const packetInfo = getSalesforceInsightPacketPathInfo(packetPath);
      if (packetInfo) {
        packetFiles.push({
          path: packetPath,
          content,
          sizeBytes: rawData.byteLength,
          sourcePath: path,
          packetInfo,
        });
      }
    }
  }

  const { packets, invalidPackets } = buildSalesforceInsightPackets(packetFiles);
  return { sourceFiles, insightPackets: packets, invalidInsightPackets: invalidPackets };
}

export async function loadSalesforceSourceFiles(files: SandboxFiles, paths?: string[]): Promise<SalesforceSourceFile[]> {
  const { sourceFiles } = await loadSalesforceWorkspaceInputs(files, paths);
  return sourceFiles;
}

async function listUploadedFilePaths(sandbox: SandboxFiles, rootPath: string): Promise<string[]> {
  const files: string[] = [];
  const pending: SandboxFileInfo[] = await sandbox.listFiles(rootPath);

  while (pending.length > 0 && files.length < MAX_SOURCE_FILES) {
    const entry = pending.shift()!;
    if (entry.isDirectory) {
      pending.push(...await sandbox.listFiles(entry.path));
      continue;
    }
    files.push(entry.path);
  }

  return files;
}

function classifySourceFile(file: SalesforceSourceFile): Omit<SalesforceMetadataComponent, 'references' | 'tags'> | null {
  const path = normalizePath(file.path);
  const pathLower = path.toLowerCase();
  const name = basename(path);
  const apiVersion = extractXmlTag(file.content, 'apiVersion');

  const fieldMatch = path.match(/objects\/([^/]+)\/fields\/([^/]+)\.field-meta\.xml$/i);
  if (fieldMatch) {
    const objectName = fieldMatch[1];
    const fieldName = stripSuffix(fieldMatch[2], '.field-meta.xml');
    return createComponentBase('custom_field', `${objectName}.${fieldName}`, file, { objectName, apiVersion });
  }

  const validationRuleMatch = path.match(/objects\/([^/]+)\/validationRules\/([^/]+)\.validationRule-meta\.xml$/i);
  if (validationRuleMatch) {
    const objectName = validationRuleMatch[1];
    const ruleName = stripSuffix(validationRuleMatch[2], '.validationRule-meta.xml');
    return createComponentBase('validation_rule', `${objectName}.${ruleName}`, file, { objectName, apiVersion });
  }

  const objectMatch = path.match(/objects\/([^/]+)\/\1\.object-meta\.xml$/i) || path.match(/objects\/([^/]+)\.object$/i);
  if (objectMatch) {
    return createComponentBase('custom_object', objectMatch[1], file, { objectName: objectMatch[1], apiVersion });
  }

  if (pathLower.endsWith('.cls')) {
    return createComponentBase('apex_class', stripSuffix(name, '.cls'), file);
  }

  if (pathLower.endsWith('.trigger')) {
    return createComponentBase('apex_trigger', stripSuffix(name, '.trigger'), file);
  }

  const lwcMatch = path.match(/lwc\/([^/]+)\//i);
  if (lwcMatch) {
    return createComponentBase('lwc_component', lwcMatch[1], file, { apiVersion });
  }

  const auraMatch = path.match(/aura\/([^/]+)\//i);
  if (auraMatch) {
    return createComponentBase('aura_component', auraMatch[1], file, { apiVersion });
  }

  if (pathLower.endsWith('.flow-meta.xml')) {
    return createComponentBase('flow', stripSuffix(name, '.flow-meta.xml'), file, { apiVersion });
  }

  if (pathLower.endsWith('.permissionset-meta.xml')) {
    return createComponentBase('permission_set', stripSuffix(name, '.permissionset-meta.xml'), file);
  }

  if (pathLower.endsWith('.profile-meta.xml')) {
    return createComponentBase('profile', stripSuffix(name, '.profile-meta.xml'), file);
  }

  if (pathLower.endsWith('.layout-meta.xml')) {
    return createComponentBase('layout', stripSuffix(name, '.layout-meta.xml'), file);
  }

  if (pathLower.endsWith('package.xml') || pathLower.endsWith('sfdx-project.json')) {
    return createComponentBase('package_manifest', name, file);
  }

  if (pathLower.includes('/custommetadata/') || pathLower.endsWith('.md-meta.xml')) {
    return createComponentBase('custom_metadata', stripSuffix(name, '-meta.xml'), file);
  }

  if (pathLower.endsWith('.xml') && (pathLower.includes('/force-app/') || pathLower.startsWith('force-app/'))) {
    return createComponentBase('unknown', name, file, { apiVersion });
  }

  return null;
}

function createComponentBase(
  type: SalesforceComponentType,
  name: string,
  file: SalesforceSourceFile,
  options: Pick<SalesforceMetadataComponent, 'objectName' | 'apiVersion'> = {},
): Omit<SalesforceMetadataComponent, 'references' | 'tags'> {
  const id = `${type}:${name}`;
  return {
    id,
    name,
    type,
    path: file.path,
    paths: [file.path],
    objectName: options.objectName,
    apiVersion: options.apiVersion,
    sizeBytes: file.sizeBytes,
    lineCount: lineCount(file.content),
  };
}

function mergeComponent(
  existing: SalesforceMetadataComponent | undefined,
  base: Omit<SalesforceMetadataComponent, 'references' | 'tags'>,
  references: SalesforceMetadataReference[],
  tags: string[],
): SalesforceMetadataComponent {
  if (!existing) {
    return {
      ...base,
      references: uniqueReferences(references),
      tags: unique(tags),
    };
  }

  return {
    ...existing,
    paths: unique([...existing.paths, ...base.paths]),
    sizeBytes: existing.sizeBytes + base.sizeBytes,
    lineCount: existing.lineCount + base.lineCount,
    references: uniqueReferences([...existing.references, ...references]),
    tags: unique([...existing.tags, ...tags]),
  };
}

function uniqueReferences(references: SalesforceMetadataReference[]): SalesforceMetadataReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractReferences(file: SalesforceSourceFile, componentType: SalesforceComponentType): SalesforceMetadataReference[] {
  if (componentType === 'apex_class' || componentType === 'apex_trigger') {
    return extractApexReferences(file.content);
  }

  if (componentType === 'lwc_component' || componentType === 'aura_component') {
    return extractLightningReferences(file.content);
  }

  return extractXmlReferences(file.content);
}

function extractApexReferences(content: string): SalesforceMetadataReference[] {
  const references: SalesforceMetadataReference[] = [];

  for (const match of content.matchAll(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*(?:__c|__mdt|__x)?)/gi)) {
    references.push({ kind: 'object', name: match[1], evidence: 'SOQL FROM' });
  }

  for (const match of content.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*(?:__c|__r)?)\.([A-Za-z_][A-Za-z0-9_]*(?:__c|__r)?)\b/g)) {
    references.push({ kind: 'field', name: `${match[1]}.${match[2]}`, evidence: 'Apex dotted reference' });
  }

  for (const match of content.matchAll(/\bnew\s+([A-Z][A-Za-z0-9_]+)\s*\(/g)) {
    references.push({ kind: 'apex', name: match[1], evidence: 'Apex constructor' });
  }

  for (const match of content.matchAll(/\b([A-Z][A-Za-z0-9_]+)\.([a-z][A-Za-z0-9_]+)\s*\(/g)) {
    if (!['System', 'Math', 'String', 'Date', 'Datetime', 'JSON', 'Test'].includes(match[1])) {
      references.push({ kind: 'apex', name: match[1], evidence: 'Apex static call' });
    }
  }

  return uniqueReferences(references);
}

function extractLightningReferences(content: string): SalesforceMetadataReference[] {
  const references: SalesforceMetadataReference[] = [];

  for (const match of content.matchAll(/@salesforce\/schema\/([A-Za-z0-9_]+(?:__c|__mdt)?(?:\.[A-Za-z0-9_]+(?:__c)?)?)/g)) {
    references.push({
      kind: match[1].includes('.') ? 'field' : 'object',
      name: match[1],
      evidence: '@salesforce/schema import',
    });
  }

  for (const match of content.matchAll(/@salesforce\/apex\/([A-Za-z0-9_]+)\.[A-Za-z0-9_]+/g)) {
    references.push({ kind: 'apex', name: match[1], evidence: '@salesforce/apex import' });
  }

  return uniqueReferences(references);
}

function extractXmlReferences(content: string): SalesforceMetadataReference[] {
  const references: SalesforceMetadataReference[] = [];
  for (const objectName of extractXmlTags(content, 'object')) {
    references.push({ kind: 'object', name: objectName, evidence: '<object>' });
  }
  for (const fieldName of extractXmlTags(content, 'field')) {
    references.push({ kind: 'field', name: fieldName, evidence: '<field>' });
  }
  for (const apexClass of [
    ...extractXmlTags(content, 'apexClass'),
    ...extractXmlTags(content, 'apexClassName'),
  ]) {
    references.push({ kind: 'apex', name: apexClass, evidence: 'XML Apex class reference' });
  }
  for (const flowName of extractXmlTags(content, 'flowName')) {
    references.push({ kind: 'flow', name: flowName, evidence: 'XML flow reference' });
  }
  return uniqueReferences(references);
}

function inferTags(file: SalesforceSourceFile, componentType: SalesforceComponentType): string[] {
  const tags: string[] = [];
  const content = file.content;

  if (/@AuraEnabled/i.test(content)) tags.push('aura-enabled');
  if (/with\s+sharing/i.test(content)) tags.push('with-sharing');
  if (/without\s+sharing/i.test(content)) tags.push('without-sharing');
  if (/@isTest/i.test(content) || /\bisTest\s*=\s*true/i.test(content)) tags.push('test');
  if (/<status>Active<\/status>/i.test(content)) tags.push('active');
  if (componentType === 'permission_set' || componentType === 'profile') tags.push('access-control');
  return tags;
}

function pathMatchesComponent(componentPath: string, affectedPath: string): boolean {
  const component = normalizeComparableMetadataPath(componentPath).toLowerCase();
  const affected = normalizeComparableMetadataPath(affectedPath).toLowerCase();
  return component === affected
    || component.endsWith(`/${affected}`)
    || affected.endsWith(`/${component}`)
    || component.startsWith(`${affected}/`)
    || affected.startsWith(`${component}/`);
}

function normalizeComparableMetadataPath(path: string): string {
  const normalized = stripWorkspacePrefix(normalizePath(path)
    .replace(/^\/?uploads\//i, '')
    .replace(/^\/?output\//i, ''));

  return normalized
    .replace(/\.cls-meta\.xml$/i, '.cls')
    .replace(/\.trigger-meta\.xml$/i, '.trigger');
}

function stripWorkspacePrefix(path: string): string {
  const lower = path.toLowerCase();
  const forceAppIndex = lower.indexOf('force-app/');
  if (forceAppIndex > 0) {
    return path.slice(forceAppIndex);
  }
  return path;
}

function componentNameMatches(component: SalesforceMetadataComponent, affectedName: string): boolean {
  const normalized = affectedName.trim().toLowerCase();
  return component.name.toLowerCase() === normalized
    || component.id.toLowerCase() === normalized
    || component.name.toLowerCase().endsWith(`.${normalized}`);
}

function joinInsightFindingsToComponents(
  components: SalesforceMetadataComponent[],
  packets: SalesforceInsightPacket[],
): SalesforceImportedInsightFinding[] {
  return packets.flatMap((packet) => packet.findings.map((finding) => {
    const matched = new Map<string, SalesforceMetadataComponent>();
    const unmatchedAffectedPaths: string[] = [];

    for (const affectedPath of finding.affectedPaths) {
      const pathMatches = components.filter((component) =>
        component.paths.some((componentPath) => pathMatchesComponent(componentPath, affectedPath))
      );
      if (pathMatches.length === 0) {
        unmatchedAffectedPaths.push(affectedPath);
      }
      for (const component of pathMatches) {
        matched.set(component.id, component);
      }
    }

    for (const affectedComponent of finding.affectedComponents) {
      for (const component of components) {
        if (componentNameMatches(component, affectedComponent)) {
          matched.set(component.id, component);
        }
      }
    }

    const matchedComponents = Array.from(matched.values()).sort((a, b) => a.name.localeCompare(b.name));
    const sourceType = finding.sourceType || inferPacketFindingSourceType({
      evidenceClaims: finding.evidenceClaims || [],
      runtimeQueries: finding.runtimeQueries || [],
      describeResults: finding.describeResults || [],
      documentationRefs: finding.documentationRefs,
    });
    return {
      ...finding,
      sourceType,
      packetRunId: packet.runId,
      packetRootPath: packet.rootPath,
      packetSourcePath: packet.sourcePath,
      matchedComponentIds: matchedComponents.map((component) => component.id),
      matchedComponentNames: matchedComponents.map((component) => component.name),
      matchedComponents: matchedComponents.map((component) => ({
        id: component.id,
        name: component.name,
        type: component.type,
        path: component.path,
        paths: component.paths,
      })),
      unmatchedAffectedPaths,
    };
  }));
}

function summarizeInsightPackets(packets: SalesforceInsightPacket[]): SalesforceMetadataIndex['insightPackets'] {
  return packets.map((packet) => ({
    runId: packet.runId,
    rootPath: packet.rootPath,
    sourcePath: packet.sourcePath,
    createdAt: packet.manifest.createdAt,
    workspaceName: packet.manifest.source.workspaceName,
    gitBranch: packet.manifest.source.gitBranch,
    gitCommit: packet.manifest.source.gitCommit,
    agent: packet.manifest.agentSession.agent,
    toolsUsed: packet.manifest.agentSession.toolsUsed,
    goals: packet.manifest.goals,
    findingCount: packet.findings.length,
    warnings: packet.warnings,
  }));
}

function packetCreatedAtByRunId(packets: SalesforceInsightPacket[]): Map<string, string> {
  return new Map(packets.map((packet) => [packet.runId, packet.manifest.createdAt]));
}

function evidenceRefsForRisk(item: SalesforceMetadataRisk): string[] {
  return unique([
    ...item.evidenceSpans.map((span) => `${span.path}:${span.startLine}-${span.endLine}`),
    ...item.evidenceDetails.map((detail) => `${detail.path}:${detail.startLine}-${detail.endLine}`),
  ]);
}

function buildSalesforceEvidenceLedgerClaims(
  risks: SalesforceMetadataRisk[],
  importedFindings: SalesforceImportedInsightFinding[],
  packets: SalesforceInsightPacket[],
  generatedAt: string,
): SalesforceEvidenceLedgerClaim[] {
  const packetCreatedAt = packetCreatedAtByRunId(packets);
  const claims: SalesforceEvidenceLedgerClaim[] = [];

  for (const item of risks) {
    claims.push({
      claimId: `metadata:${item.ruleId}:${item.id}`,
      claim: `Static metadata signal "${item.title}" detected on ${item.componentName}.`,
      sourceType: 'metadata',
      confidence: item.confidence,
      observedAt: generatedAt,
      artifactRefs: ['salesforce-signal-evidence.json', 'salesforce-remediation-backlog.json'],
      evidenceRefs: evidenceRefsForRisk(item),
      queryRefs: [],
      limitations: item.limitations,
      relatedComponentIds: [item.componentId],
      relatedComponentNames: [item.componentName],
      ruleId: item.ruleId,
    });
  }

  for (const finding of importedFindings) {
    const observedAt = finding.observedAt || packetCreatedAt.get(finding.packetRunId) || generatedAt;
    const rawEvidenceRefs = unique([
      ...finding.evidenceRefs,
      ...(finding.documentationRefs || []),
      ...(finding.runtimeQueries || []).map((query) => query.id),
      ...(finding.describeResults || []).map((describe) => describe.id),
    ]);
    const limitations = finding.sourceType === 'agent_summary'
      ? ['Imported packet finding did not include raw SOQL/describe evidence; treat as a hypothesis requiring verification.']
      : [];

    claims.push({
      claimId: `packet:${finding.packetRunId}:${finding.id}`,
      claim: finding.summary,
      sourceType: finding.sourceType,
      confidence: finding.sourceType === 'agent_summary' ? Math.min(finding.confidence, 0.6) : finding.confidence,
      observedAt,
      artifactRefs: ['salesforce-insight-packets.json', 'salesforce-evidence-ledger.json'],
      evidenceRefs: rawEvidenceRefs,
      queryRefs: [
        ...(finding.runtimeQueries || []).map((query) => query.id),
        ...(finding.describeResults || []).map((describe) => describe.id),
      ],
      limitations,
      relatedComponentIds: finding.matchedComponentIds,
      relatedComponentNames: finding.matchedComponentNames,
      parentFindingId: finding.id,
      packetRunId: finding.packetRunId,
    });

    for (const evidenceClaim of finding.evidenceClaims || []) {
      claims.push({
        claimId: `packet:${finding.packetRunId}:${finding.id}:${evidenceClaim.claimId}`,
        claim: evidenceClaim.claim,
        sourceType: evidenceClaim.sourceType,
        confidence: evidenceClaim.sourceType === 'agent_summary'
          ? Math.min(evidenceClaim.confidence ?? finding.confidence, 0.6)
          : evidenceClaim.confidence ?? finding.confidence,
        observedAt: evidenceClaim.observedAt || observedAt,
        artifactRefs: ['salesforce-insight-packets.json', 'salesforce-evidence-ledger.json'],
        evidenceRefs: evidenceClaim.evidenceRefs,
        queryRefs: evidenceClaim.queryRefs,
        limitations: evidenceClaim.limitations,
        relatedComponentIds: finding.matchedComponentIds,
        relatedComponentNames: finding.matchedComponentNames,
        parentFindingId: finding.id,
        packetRunId: finding.packetRunId,
      });
    }
  }

  return claims.sort((a, b) => a.sourceType.localeCompare(b.sourceType) || a.claimId.localeCompare(b.claimId));
}

const FLOW_MUTATION_TAGS = ['recordCreates', 'recordUpdates', 'recordDeletes', 'actionCalls', 'apexPluginCalls', 'subflows'];

function buildSalesforceFlowDrilldownRecords(
  components: SalesforceMetadataComponent[],
  risks: SalesforceMetadataRisk[],
  fileByPath: Map<string, SalesforceSourceFile>,
): SalesforceFlowDrilldown[] {
  return components
    .filter((component) => component.type === 'flow')
    .map((component) => {
      const content = component.paths.map((path) => fileByPath.get(path)?.content || '').join('\n');
      const elements = flowElementEvidenceDetails(component, content, FLOW_MUTATION_TAGS);
      const componentRisks = risks.filter((riskItem) => riskItem.componentId === component.id);
      const riskDetails = componentRisks.flatMap((riskItem) =>
        riskItem.evidenceDetails.filter((detail) => detail.kind === 'flow_element')
      );
      const allElements = uniqueSignalDetails([...elements, ...riskDetails]);
      return {
        componentId: component.id,
        componentName: component.name,
        path: component.path,
        status: extractXmlTag(content, 'status'),
        processType: extractXmlTag(content, 'processType'),
        elements: allElements,
        mutatingElementsWithoutFaults: allElements.filter((detail) =>
          FLOW_MUTATION_TAGS.includes(detail.type || '')
          && detail.attributes?.hasFaultConnector === false
        ),
        subflowReferences: unique(allElements
          .map((detail) => typeof detail.attributes?.flowName === 'string' ? detail.attributes.flowName : '')
          .filter(Boolean)),
        relatedRiskIds: componentRisks.map((riskItem) => riskItem.id),
        limitations: ['Flow XML drilldown is static. Runtime entry criteria, activated version behavior, and subflow runtime outcomes require org verification.'],
      };
    })
    .filter((item) => item.elements.length > 0 || item.relatedRiskIds.length > 0)
    .sort((a, b) => a.componentName.localeCompare(b.componentName));
}

function uniqueSignalDetails(details: SalesforceSignalEvidenceDetail[]): SalesforceSignalEvidenceDetail[] {
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = `${detail.path}:${detail.startLine}:${detail.endLine}:${detail.type}:${detail.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findMatchingBrace(content: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return openBraceIndex;
}

function apexMethodSpans(content: string): SalesforceApexDrilldown['methodSpans'] {
  const spans: SalesforceApexDrilldown['methodSpans'] = [];
  const methodPattern = /\b(?:public|private|protected|global)\s+(?:static\s+)?(?:[\w<>\[\],]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
  for (const match of content.matchAll(methodPattern)) {
    const openBraceIndex = (match.index || 0) + match[0].lastIndexOf('{');
    const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
    const startLine = lineNumberForOffset(content, match.index || 0);
    const endLine = lineNumberForOffset(content, closeBraceIndex);
    spans.push({
      name: match[1],
      startLine,
      endLine,
      snippet: content.slice(match.index || 0, Math.min(closeBraceIndex + 1, (match.index || 0) + 700)).replace(/\s+/g, ' ').trim(),
    });
    if (spans.length >= 25) break;
  }
  return spans;
}

function inferApexSharingMode(content: string): SalesforceApexDrilldown['sharingMode'] {
  if (/\bwithout\s+sharing\b/i.test(content)) return 'without sharing';
  if (/\bwith\s+sharing\b/i.test(content)) return 'with sharing';
  if (/\binherited\s+sharing\b/i.test(content)) return 'inherited sharing';
  return 'unspecified';
}

function extractApexEmailReferences(content: string): SalesforceApexDrilldown['emailReferences'] {
  const references: SalesforceApexDrilldown['emailReferences'] = [];
  const pattern = /\b(EmailMessage|Messaging\.[A-Za-z0-9_]+|SingleEmailMessage|InboundEmail|EmailServicesFunction|EmailTemplate|ReplyToEmailMessageId|ThreadIdentifier|RelatedToId|Headers)\b/g;
  for (const match of content.matchAll(pattern)) {
    const startLine = lineNumberForOffset(content, match.index || 0);
    const line = content.split(/\r?\n/)[startLine - 1] || match[0];
    references.push({
      token: match[1],
      startLine,
      snippet: line.trim().slice(0, 240),
    });
    if (references.length >= 40) break;
  }
  return references;
}

function buildSalesforceApexDrilldownRecords(
  components: SalesforceMetadataComponent[],
  risks: SalesforceMetadataRisk[],
  fileByPath: Map<string, SalesforceSourceFile>,
): SalesforceApexDrilldown[] {
  return components
    .filter((component) => component.type === 'apex_class' || component.type === 'apex_trigger')
    .map((component) => {
      const content = component.paths.map((path) => fileByPath.get(path)?.content || '').join('\n');
      const componentRisks = risks.filter((riskItem) => riskItem.componentId === component.id);
      return {
        componentId: component.id,
        componentName: component.name,
        componentType: component.type,
        path: component.path,
        sharingMode: inferApexSharingMode(content),
        methodSpans: apexMethodSpans(content),
        evidenceDetails: uniqueSignalDetails(componentRisks.flatMap((riskItem) =>
          riskItem.evidenceDetails.filter((detail) => detail.kind === 'apex_block' || detail.kind === 'metadata_element')
        )),
        emailReferences: extractApexEmailReferences(content),
        relatedRiskIds: componentRisks.map((riskItem) => riskItem.id),
        limitations: ['Apex drilldown is static source evidence. Actual coverage, sharing outcomes, triggerability, and org setup require org/runtime verification.'],
      };
    })
    .filter((item) =>
      item.methodSpans.length > 0
      || item.evidenceDetails.length > 0
      || item.emailReferences.length > 0
      || item.relatedRiskIds.length > 0
    )
    .sort((a, b) => a.componentName.localeCompare(b.componentName));
}

interface FeatureTermRule {
  id: string;
  label: string;
  category: SalesforceFeatureReferenceMap['features'][number]['category'];
  patterns: RegExp[];
  referenceNames: string[];
  docTopicIds: string[];
  runtimeVerificationRequired: boolean;
}

const SALESFORCE_FEATURE_TERM_RULES: FeatureTermRule[] = [
  {
    id: 'emailmessage',
    label: 'EmailMessage',
    category: 'object',
    patterns: [/\bEmailMessage\b/i],
    referenceNames: ['EmailMessage'],
    docTopicIds: ['emailmessage-object-reference'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'emailmessage-replytoemailmessageid',
    label: 'EmailMessage.ReplyToEmailMessageId',
    category: 'field',
    patterns: [/\bReplyToEmailMessageId\b/i],
    referenceNames: ['EmailMessage.ReplyToEmailMessageId', 'ReplyToEmailMessageId'],
    docTopicIds: ['emailmessage-threading-fields'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'emailmessage-threadidentifier',
    label: 'EmailMessage.ThreadIdentifier',
    category: 'field',
    patterns: [/\bThreadIdentifier\b/i],
    referenceNames: ['EmailMessage.ThreadIdentifier', 'ThreadIdentifier'],
    docTopicIds: ['emailmessage-threading-fields'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'emailmessage-headers',
    label: 'EmailMessage.Headers',
    category: 'field',
    patterns: [/\bHeaders\b/i, /\bemail headers?\b/i],
    referenceNames: ['EmailMessage.Headers', 'Headers'],
    docTopicIds: ['emailmessage-threading-fields'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'emailmessage-relatedtoid',
    label: 'EmailMessage.RelatedToId',
    category: 'field',
    patterns: [/\bRelatedToId\b/i],
    referenceNames: ['EmailMessage.RelatedToId', 'RelatedToId'],
    docTopicIds: ['activity-task-relationships', 'emailmessage-object-reference'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'email-to-salesforce',
    label: 'Email-to-Salesforce',
    category: 'integration',
    patterns: [/\bEmail-to-Salesforce\b/i, /\bEmail to Salesforce\b/i, /\bE2S\b/i],
    referenceNames: ['EmailServicesFunction', 'EmailServicesAddress'],
    docTopicIds: ['email-to-salesforce', 'email-services'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'enhanced-email-activity-capture',
    label: 'Enhanced Email / Einstein Activity Capture',
    category: 'integration',
    patterns: [/\bEnhanced Email\b/i, /\bEinstein Activity Capture\b/i, /\bEAC\b/i],
    referenceNames: ['EmailMessage', 'Task'],
    docTopicIds: ['enhanced-email-activity-capture'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'outlook-email-integration',
    label: 'Outlook/Gmail email logging',
    category: 'integration',
    patterns: [/\bOutlook\b/i, /\bGmail\b/i, /\bemail logging\b/i],
    referenceNames: ['EmailMessage', 'Task'],
    docTopicIds: ['outlook-email-integration'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'email-template-body',
    label: 'Email template body and merge fields',
    category: 'metadata',
    patterns: [/\bEmailTemplate\b/i, /\bemail template\b/i, /\bHtmlValue\b/i, /\bmerge fields?\b/i],
    referenceNames: ['EmailTemplate', 'HtmlValue', 'Body'],
    docTopicIds: ['email-templates'],
    runtimeVerificationRequired: false,
  },
  {
    id: 'apex-email-apis',
    label: 'Apex email APIs',
    category: 'apex',
    patterns: [/\bMessaging\.SingleEmailMessage\b/i, /\bMessaging\.sendEmail\b/i, /\bInboundEmail\b/i],
    referenceNames: ['Messaging.SingleEmailMessage', 'Messaging.sendEmail', 'InboundEmail'],
    docTopicIds: ['apex-email-apis', 'email-services'],
    runtimeVerificationRequired: false,
  },
  {
    id: 'named-credentials',
    label: 'Named credentials / external credentials',
    category: 'integration',
    patterns: [/\bNamedCredential\b/i, /\bExternalCredential\b/i, /\bnamed credentials?\b/i, /\bexternal credentials?\b/i, /\bcallouts?\b/i],
    referenceNames: ['NamedCredential', 'ExternalCredential', 'HttpRequest', 'callout:'],
    docTopicIds: ['named-credentials-external-credentials'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'connected-app-oauth',
    label: 'Connected apps and OAuth',
    category: 'integration',
    patterns: [/\bConnectedApp\b/i, /\bconnected apps?\b/i, /\bOAuth\b/i, /\bconsumer key\b/i, /\bcallback URL\b/i],
    referenceNames: ['ConnectedApp', 'oauth', 'consumerKey', 'callbackUrl'],
    docTopicIds: ['connected-app-oauth'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'platform-events-pubsub',
    label: 'Platform events / Pub/Sub',
    category: 'integration',
    patterns: [/\bPlatformEvent\b/i, /\bEventBus\b/i, /\bPub\/Sub\b/i, /\bChangeEvent\b/i, /\b__e\b/],
    referenceNames: ['PlatformEvent', 'EventBus', 'ChangeEvent', '__e'],
    docTopicIds: ['platform-events-pubsub'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'custom-metadata-types',
    label: 'Custom metadata types',
    category: 'metadata',
    patterns: [/\bCustomMetadata\b/i, /\bCustomMetadataValue\b/i, /\b__mdt\b/i, /\bcustom metadata\b/i],
    referenceNames: ['CustomMetadata', '__mdt'],
    docTopicIds: ['custom-metadata-types'],
    runtimeVerificationRequired: false,
  },
  {
    id: 'duplicate-matching-rules',
    label: 'Duplicate and matching rules',
    category: 'metadata',
    patterns: [/\bDuplicateRule\b/i, /\bMatchingRule\b/i, /\bduplicate rules?\b/i, /\bmatching rules?\b/i],
    referenceNames: ['DuplicateRule', 'MatchingRule'],
    docTopicIds: ['duplicate-matching-rules'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'reports-dashboards',
    label: 'Reports and dashboards',
    category: 'metadata',
    patterns: [/\.report-meta\.xml\b/i, /\.dashboard-meta\.xml\b/i, /\/reports\//i, /\/dashboards\//i, /\bDashboard\b/i, /\breport types?\b/i],
    referenceNames: ['.report-meta.xml', '.dashboard-meta.xml', 'Dashboard', 'ReportType'],
    docTopicIds: ['reports-dashboards-metadata'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'workflow-approval-processes',
    label: 'Workflow and approval processes',
    category: 'metadata',
    patterns: [/\bWorkflow\b/i, /\bWorkflowRule\b/i, /\bApprovalProcess\b/i, /\bapproval process\b/i],
    referenceNames: ['Workflow', 'WorkflowRule', 'ApprovalProcess'],
    docTopicIds: ['workflow-approval-processes'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'record-types-picklists',
    label: 'Record types and picklists',
    category: 'metadata',
    patterns: [/\bRecordType\b/i, /\brecord types?\b/i, /\bpicklists?\b/i, /\bGlobalValueSet\b/i, /\bStandardValueSet\b/i],
    referenceNames: ['RecordType', 'GlobalValueSet', 'StandardValueSet', 'picklist'],
    docTopicIds: ['record-types-picklists'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'sales-cloud-standard-objects',
    label: 'Sales Cloud standard objects',
    category: 'object',
    patterns: [/\bSales Cloud\b/i, /\bAccount\b/i, /\bContact\b/i, /\bLead\b/i, /\bOpportunity\b/i, /\bCampaign\b/i, /\bForecast/i, /\bTerritory\b/i],
    referenceNames: ['Account', 'Contact', 'Lead', 'Opportunity', 'Campaign', 'Forecast', 'Territory2'],
    docTopicIds: ['sales-cloud-admin-setup', 'standard-object-reference-sales-service'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'service-cloud-standard-objects',
    label: 'Service Cloud case model',
    category: 'object',
    patterns: [/\bService Cloud\b/i, /\bCase\b/i, /\bEntitlement\b/i, /\bMilestone\b/i, /\bKnowledge\b/i, /\bQueue\b/i, /\bsupport process\b/i],
    referenceNames: ['Case', 'Entitlement', 'Milestone', 'Knowledge__kav', 'QueueSobject'],
    docTopicIds: ['service-cloud-admin-setup', 'standard-object-reference-sales-service'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'data-cloud',
    label: 'Data Cloud',
    category: 'integration',
    patterns: [/\bData Cloud\b/i, /\bDataCloud\b/i, /\bDLO\b/i, /\bDMO\b/i, /\bDataStream\b/i, /\bCalculatedInsight\b/i, /\bUnifiedIndividual\b/i, /\bidentity resolution\b/i],
    referenceNames: ['DataCloud', 'DLO', 'DMO', 'DataStream', 'CalculatedInsight', 'UnifiedIndividual'],
    docTopicIds: ['data-cloud-development', 'data-cloud-ingestion-query', 'data-cloud-identity-modeling'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'revenue-cloud',
    label: 'Revenue Cloud / CPQ',
    category: 'integration',
    patterns: [/\bRevenue Cloud\b/i, /\bCPQ\b/i, /\bQuote\b/i, /\bQuoteLineItem\b/i, /\bProduct2\b/i, /\bPricebook2\b/i, /\bOrderItem\b/i, /\bContract\b/i, /\bAsset\b/i, /\bIndustries\b/i, /\bCME\b/i],
    referenceNames: ['Quote', 'QuoteLineItem', 'Product2', 'Pricebook2', 'Order', 'OrderItem', 'Contract', 'Asset', 'CPQ', 'CME'],
    docTopicIds: ['revenue-cloud-data-model', 'revenue-cloud-cpq-industries', 'standard-object-reference-sales-service'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'marketing-cloud',
    label: 'Marketing Cloud',
    category: 'integration',
    patterns: [/\bMarketing Cloud\b/i, /\bDataExtension\b/i, /\bSubscriber\b/i, /\bJourney\b/i, /\bEmail Studio\b/i, /\bContent Builder\b/i, /\bMarketing Cloud Growth\b/i],
    referenceNames: ['MarketingCloud', 'DataExtension', 'Subscriber', 'Journey', 'EmailStudio', 'ContentBuilder'],
    docTopicIds: ['marketing-cloud-engagement-apis', 'marketing-cloud-growth-development'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'metadata-api-types',
    label: 'Metadata API types and coverage',
    category: 'metadata',
    patterns: [/\bMetadata API\b/i, /\bpackage\.xml\b/i, /\bCustomObject\b/i, /\bCustomField\b/i, /\bFlexiPage\b/i, /\bLayout\b/i, /\bProfile\b/i, /\bPermissionSet\b/i, /\bFlowDefinition\b/i],
    referenceNames: ['Metadata API', 'package.xml', 'CustomObject', 'CustomField', 'FlexiPage', 'Layout', 'Profile', 'PermissionSet', 'FlowDefinition'],
    docTopicIds: ['metadata-api-type-reference', 'metadata-api-versioning', 'metadata-deploy-retrieve-source-format'],
    runtimeVerificationRequired: true,
  },
  {
    id: 'flow-metadata-edge-cases',
    label: 'Flow metadata edge cases',
    category: 'metadata',
    patterns: [/\bFlow\b/i, /\bFlowDefinition\b/i, /\bFlowSettings\b/i, /\bFlowTest\b/i, /\brecord-triggered\b/i, /\bautolaunched\b/i, /\bsubflow\b/i, /\bfault path\b/i],
    referenceNames: ['Flow', 'FlowDefinition', 'FlowSettings', 'FlowTest', 'record-triggered', 'autolaunched', 'subflow'],
    docTopicIds: ['flow-metadata-edge-cases', 'flow-fault-paths', 'flow-order-recursion', 'flow-tests-debugging'],
    runtimeVerificationRequired: true,
  },
];

function importedFindingText(finding: SalesforceImportedInsightFinding): string {
  return [
    finding.title,
    finding.summary,
    finding.recommendedNextStep,
    finding.affectedPaths.join(' '),
    finding.affectedComponents.join(' '),
    finding.evidenceClaims?.map((claim) => claim.claim).join(' ') || '',
    finding.runtimeQueries?.map((query) => query.query).join(' ') || '',
    finding.describeResults?.map((describe) => describe.objectName).join(' ') || '',
  ].join(' ');
}

function componentFeatureHaystack(component: SalesforceMetadataComponent): string {
  return [
    component.name,
    component.path,
    component.tags.join(' '),
    component.references.map((reference) => `${reference.name} ${reference.evidence || ''}`).join(' '),
  ].join(' ');
}

function featureRuleMatchesText(rule: FeatureTermRule, text: string): boolean {
  return rule.patterns.some((pattern) => pattern.test(text));
}

function componentMatchesFeatureRule(component: SalesforceMetadataComponent, rule: FeatureTermRule): boolean {
  const haystack = componentFeatureHaystack(component).toLowerCase();
  return rule.referenceNames.some((name) => haystack.includes(name.toLowerCase()))
    || rule.patterns.some((pattern) => pattern.test(haystack));
}

function buildSalesforceFeatureReferenceMapObject(
  components: SalesforceMetadataComponent[],
  importedFindings: SalesforceImportedInsightFinding[],
  documentationTopics: SalesforceDocumentationTopic[],
  generatedAt: string,
  query?: string,
): SalesforceFeatureReferenceMap {
  const contextText = [
    query || '',
    importedFindings.map(importedFindingText).join(' '),
    components
      .filter((component) => /email|message|activity|task|template|inbound|outlook|gmail|account|contact|lead|opportunity|campaign|case|entitlement|knowledge|data cloud|datacloud|dmo|dlo|revenue|cpq|quote|product2|pricebook|order|contract|asset|marketing cloud|dataextension|subscriber|journey|metadata api|customobject|customfield|flowdefinition|flowsettings|flowtest/i.test(componentFeatureHaystack(component)))
      .map(componentFeatureHaystack)
      .join(' '),
  ].join(' ');
  const availableDocTopicIds = new Set(documentationTopics.map((topic) => topic.id));

  const features = SALESFORCE_FEATURE_TERM_RULES
    .filter((rule) =>
      featureRuleMatchesText(rule, contextText)
      || components.some((component) => componentMatchesFeatureRule(component, rule))
      || importedFindings.some((finding) => featureRuleMatchesText(rule, importedFindingText(finding)))
    )
    .map((rule) => {
      const matchedComponents = components
        .filter((component) => componentMatchesFeatureRule(component, rule))
        .slice(0, 50)
        .map((component) => ({
          id: component.id,
          name: component.name,
          type: component.type,
          path: component.path,
          references: component.references.filter((reference) =>
            rule.referenceNames.some((name) =>
              reference.name.toLowerCase().includes(name.toLowerCase())
              || name.toLowerCase().includes(reference.name.toLowerCase())
            )
          ),
        }));
      const importedFindingIds = importedFindings
        .filter((finding) => featureRuleMatchesText(rule, importedFindingText(finding)))
        .map((finding) => `${finding.packetRunId}:${finding.id}`);
      return {
        id: rule.id,
        label: rule.label,
        category: rule.category,
        reasons: unique([
          featureRuleMatchesText(rule, query || '') ? 'Matched the user question or issue context.' : '',
          matchedComponents.length > 0 ? 'Matched uploaded Salesforce metadata references.' : '',
          importedFindingIds.length > 0 ? 'Matched imported packet finding text or runtime query evidence.' : '',
        ].filter(Boolean)),
        matchedComponents,
        importedFindingIds,
        docTopicIds: rule.docTopicIds.filter((topicId) => availableDocTopicIds.has(topicId)),
        runtimeVerificationRequired: rule.runtimeVerificationRequired,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

  return {
    version: 1,
    generatedAt,
    query: query?.trim() || undefined,
    features,
  };
}

export function buildSalesforceMetadataIndex(
  files: SalesforceSourceFile[],
  inputPaths: string[] = [],
  insightPackets: SalesforceInsightPacket[] = [],
  query?: string,
): SalesforceMetadataIndex {
  const componentsById = new Map<string, SalesforceMetadataComponent>();
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const generatedAt = new Date().toISOString();

  for (const file of files.slice(0, MAX_SOURCE_FILES)) {
    const base = classifySourceFile(file);
    if (!base) continue;

    const references = extractReferences(file, base.type);
    const tags = inferTags(file, base.type);
    const existing = componentsById.get(base.id);
    componentsById.set(base.id, mergeComponent(existing, base, references, tags));
  }

  const components = Array.from(componentsById.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const dependencies = buildDependencies(components);
  const risks = buildRisks(components, fileByPath).sort((a, b) => {
    const severityDelta = RISK_ORDER[a.severity] - RISK_ORDER[b.severity];
    return severityDelta !== 0 ? severityDelta : a.componentName.localeCompare(b.componentName);
  });
  const importedFindings = joinInsightFindingsToComponents(components, insightPackets)
    .sort((a, b) => {
      const severityDelta = RISK_ORDER[a.severity] - RISK_ORDER[b.severity];
      return severityDelta !== 0 ? severityDelta : a.title.localeCompare(b.title);
    });
  const documentationTopics = buildSalesforceDocumentationTopicsFromSignals(
    components,
    risks,
    importedFindings,
    query,
  );
  const evidenceLedger = buildSalesforceEvidenceLedgerClaims(risks, importedFindings, insightPackets, generatedAt);
  const flowDrilldowns = buildSalesforceFlowDrilldownRecords(components, risks, fileByPath);
  const apexDrilldowns = buildSalesforceApexDrilldownRecords(components, risks, fileByPath);
  const featureReferenceMap = buildSalesforceFeatureReferenceMapObject(
    components,
    importedFindings,
    documentationTopics,
    generatedAt,
    query,
  );

  const recognizedTypes = components.reduce((acc, component) => {
    acc[component.type] = (acc[component.type] || 0) + 1;
    return acc;
  }, {} as Partial<Record<SalesforceComponentType, number>>);

  return {
    generatedAt,
    sourceSummary: {
      fileCount: files.length,
      componentCount: components.length,
      totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
      recognizedTypes,
      inputPaths,
      insightPacketCount: insightPackets.length,
      importedFindingCount: importedFindings.length,
      safetyBoundary: 'Read-only metadata audit. No code edits, deployments, destructive org operations, or production mutations are performed.',
    },
    components,
    dependencies,
    risks,
    documentationTopics,
    evidenceLedger,
    flowDrilldowns,
    apexDrilldowns,
    featureReferenceMap,
    insightPackets: summarizeInsightPackets(insightPackets),
    importedFindings,
  };
}

function buildSalesforceDocumentationTopicsFromSignals(
  components: SalesforceMetadataComponent[],
  risks: SalesforceMetadataRisk[],
  importedFindings: SalesforceImportedInsightFinding[],
  query?: string,
): SalesforceDocumentationTopic[] {
  const topics = new Map<string, SalesforceDocumentationTopic>();
  const componentTypesByTopic = new Map<string, Set<SalesforceComponentType>>();
  const apiVersionsByTopic = new Map<string, Set<string>>();
  const riskIdsByTopic = new Map<string, Set<string>>();

  const ensureTopic = (topicId: string, reason: string) => {
    const base = BASE_DOCUMENTATION_TOPICS[topicId];
    if (!base) return;
    const existing = topics.get(topicId);
    topics.set(topicId, {
      id: base.id,
      label: base.label,
      query: base.query,
      category: base.category,
      reasons: unique([...(existing?.reasons || []), ...base.reasons, reason]),
      componentTypes: Array.from(componentTypesByTopic.get(topicId) || []),
      apiVersions: Array.from(apiVersionsByTopic.get(topicId) || []),
      riskSignalIds: Array.from(riskIdsByTopic.get(topicId) || []),
    });
  };

  const addComponentContext = (topicId: string, component: SalesforceMetadataComponent) => {
    const componentTypes = componentTypesByTopic.get(topicId) || new Set<SalesforceComponentType>();
    componentTypes.add(component.type);
    componentTypesByTopic.set(topicId, componentTypes);
    if (component.apiVersion) {
      const apiVersions = apiVersionsByTopic.get(topicId) || new Set<string>();
      apiVersions.add(component.apiVersion);
      apiVersionsByTopic.set(topicId, apiVersions);
    }
  };

  for (const component of components) {
    if (component.type === 'apex_class' || component.type === 'apex_trigger') {
      addComponentContext('apex-governor-limits', component);
      addComponentContext('apex-sharing-security', component);
      addComponentContext('apex-crud-fls-user-mode', component);
      addComponentContext('apex-async-processing', component);
      addComponentContext('soql-query-selectivity', component);
      ensureTopic('apex-governor-limits', `${component.type} metadata detected.`);
      ensureTopic('apex-sharing-security', `${component.type} metadata detected.`);
      ensureTopic('apex-crud-fls-user-mode', `${component.type} metadata detected.`);
      ensureTopic('apex-async-processing', `${component.type} metadata detected.`);
      ensureTopic('soql-query-selectivity', `${component.type} metadata detected.`);
    }
    if (component.type === 'flow') {
      addComponentContext('flow-fault-paths', component);
      addComponentContext('flow-order-recursion', component);
      addComponentContext('flow-tests-debugging', component);
      addComponentContext('flow-metadata-edge-cases', component);
      addComponentContext('metadata-api-type-reference', component);
      ensureTopic('flow-fault-paths', 'Flow metadata detected.');
      ensureTopic('flow-order-recursion', 'Flow metadata detected.');
      ensureTopic('flow-tests-debugging', 'Flow metadata detected.');
      ensureTopic('flow-metadata-edge-cases', 'Flow metadata detected.');
      ensureTopic('metadata-api-type-reference', 'Flow metadata detected.');
    }
    if (component.type === 'permission_set' || component.type === 'profile') {
      addComponentContext('permissions-least-privilege', component);
      addComponentContext('field-level-security-object-permissions', component);
      addComponentContext('sharing-model-rules', component);
      ensureTopic('permissions-least-privilege', `${component.type} metadata detected.`);
      ensureTopic('field-level-security-object-permissions', `${component.type} metadata detected.`);
      ensureTopic('sharing-model-rules', `${component.type} metadata detected.`);
    }
    if (component.type === 'lwc_component' || component.type === 'aura_component') {
      addComponentContext('lightning-security', component);
      addComponentContext('lightning-record-pages-layouts', component);
      addComponentContext('field-level-security-object-permissions', component);
      ensureTopic('lightning-security', `${component.type} metadata detected.`);
      ensureTopic('lightning-record-pages-layouts', `${component.type} metadata detected.`);
      ensureTopic('field-level-security-object-permissions', `${component.type} metadata detected.`);
    }
    if (component.type === 'custom_object' || component.type === 'custom_field') {
      addComponentContext('object-field-modeling', component);
      addComponentContext('field-level-security-object-permissions', component);
      addComponentContext('record-types-picklists', component);
      addComponentContext('metadata-api-type-reference', component);
      addComponentContext('standard-object-reference-sales-service', component);
      ensureTopic('object-field-modeling', `${component.type} metadata detected.`);
      ensureTopic('field-level-security-object-permissions', `${component.type} metadata detected.`);
      ensureTopic('record-types-picklists', `${component.type} metadata detected.`);
      ensureTopic('metadata-api-type-reference', `${component.type} metadata detected.`);
      ensureTopic('standard-object-reference-sales-service', `${component.type} metadata detected.`);
    }
    if (component.type === 'validation_rule') {
      addComponentContext('validation-rules-formulas', component);
      addComponentContext('metadata-api-type-reference', component);
      ensureTopic('validation-rules-formulas', 'Validation rule metadata detected.');
      ensureTopic('metadata-api-type-reference', 'Validation rule metadata detected.');
    }
    if (component.type === 'layout') {
      addComponentContext('lightning-record-pages-layouts', component);
      ensureTopic('lightning-record-pages-layouts', 'Layout metadata detected.');
    }
    if (component.type === 'custom_metadata') {
      addComponentContext('custom-metadata-types', component);
      ensureTopic('custom-metadata-types', 'Custom metadata detected.');
    }
    if (component.apiVersion || component.type === 'package_manifest') {
      addComponentContext('metadata-api-versioning', component);
      addComponentContext('metadata-deploy-retrieve-source-format', component);
      addComponentContext('metadata-api-type-reference', component);
      ensureTopic('metadata-api-versioning', 'API-versioned metadata detected.');
      ensureTopic('metadata-deploy-retrieve-source-format', 'API-versioned metadata detected.');
      ensureTopic('metadata-api-type-reference', 'API-versioned metadata detected.');
    }
  }

  for (const riskItem of risks) {
    const topicIds = riskItem.docTopicIds.length > 0
      ? riskItem.docTopicIds
      : RISK_DOC_TOPIC_IDS[riskItem.ruleId] || [];
    for (const topicId of topicIds) {
      const riskIds = riskIdsByTopic.get(topicId) || new Set<string>();
      riskIds.add(riskItem.ruleId);
      riskIdsByTopic.set(topicId, riskIds);
      ensureTopic(topicId, `Static signal ${riskItem.ruleId} fired.`);
    }
  }

  if (importedFindings.length > 0) {
    const topicId = 'salesforce-release-updates';
    ensureTopic(topicId, 'Imported agent findings should be reconciled against current Salesforce documentation.');

    const importedDocumentationRefs = unique(importedFindings.flatMap((finding) => finding.documentationRefs || []))
      .filter((ref) => ref.trim())
      .slice(0, 8);
    importedDocumentationRefs.forEach((ref, index) => {
      const id = `imported-doc-ref-${topicIdFragment(ref) || index + 1}`;
      const relatedFindings = importedFindings.filter((finding) => (finding.documentationRefs || []).includes(ref));
      topics.set(id, {
        id,
        label: `Imported documentation reference ${index + 1}`,
        query: ref,
        category: 'imported_evidence',
        reasons: unique([
          'Imported insight packet supplied this documentation reference.',
          ...relatedFindings.map((finding) => `Referenced by imported finding ${finding.id}.`),
        ]),
        componentTypes: unique(relatedFindings.flatMap((finding) => finding.matchedComponents.map((component) => component.type))),
        apiVersions: [],
        riskSignalIds: [],
      });
    });
  }

  const featureContext = [
    query || '',
    importedFindings.map(importedFindingText).join(' '),
    components
      .filter((component) => /email|message|activity|task|template|inbound|outlook|gmail|account|contact|lead|opportunity|campaign|case|entitlement|knowledge|data cloud|datacloud|dmo|dlo|revenue|cpq|quote|product2|pricebook|order|contract|asset|marketing cloud|dataextension|subscriber|journey|metadata api|customobject|customfield|flowdefinition|flowsettings|flowtest/i.test(componentFeatureHaystack(component)))
      .map(componentFeatureHaystack)
      .join(' '),
  ].join(' ');

  for (const rule of SALESFORCE_FEATURE_TERM_RULES) {
    const matchedComponents = components.filter((component) => componentMatchesFeatureRule(component, rule));
    const matchedImportedFindings = importedFindings.filter((finding) => featureRuleMatchesText(rule, importedFindingText(finding)));
    const shouldAddRule = featureRuleMatchesText(rule, featureContext)
      || matchedComponents.length > 0
      || matchedImportedFindings.length > 0;
    if (!shouldAddRule) continue;
    for (const topicId of rule.docTopicIds) {
      for (const component of matchedComponents) {
        addComponentContext(topicId, component);
      }
      ensureTopic(topicId, `Question, metadata, or imported packet evidence referenced ${rule.label}.`);
    }
  }

  if (query?.trim()) {
    topics.set('user-goal-context', {
      id: 'user-goal-context',
      label: 'User-requested Salesforce goal or issue context',
      query: query.trim(),
      category: 'general',
      reasons: ['User supplied query or issue context for this Salesforce run.'],
      componentTypes: [],
      apiVersions: [],
      riskSignalIds: [],
    });
  }

  return Array.from(topics.values())
    .map((topic) => ({
      ...topic,
      componentTypes: unique(topic.componentTypes),
      apiVersions: unique(topic.apiVersions),
      riskSignalIds: unique(topic.riskSignalIds),
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

function topicIdFragment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function buildDependencies(components: SalesforceMetadataComponent[]): SalesforceMetadataDependency[] {
  const targetLookup = new Map<string, SalesforceMetadataComponent>();
  for (const component of components) {
    targetLookup.set(component.name.toLowerCase(), component);
    if (component.type === 'custom_field') targetLookup.set(component.name.split('.').pop()!.toLowerCase(), component);
  }

  const dependencies: SalesforceMetadataDependency[] = [];
  const seen = new Set<string>();

  for (const source of components) {
    for (const reference of source.references) {
      const target = targetLookup.get(reference.name.toLowerCase());
      if (!target || target.id === source.id) continue;

      const key = `${source.id}->${target.id}:${reference.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dependencies.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.type,
        targetId: target.id,
        targetName: target.name,
        targetType: target.type,
        reference: reference.name,
        relationship: reference.kind === 'permission' ? 'configures' : 'references',
      });
    }
  }

  return dependencies.sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.targetName.localeCompare(b.targetName));
}

function buildRisks(
  components: SalesforceMetadataComponent[],
  fileByPath: Map<string, SalesforceSourceFile>,
): SalesforceMetadataRisk[] {
  const risks: SalesforceMetadataRisk[] = [];
  const apexTests = components.filter((component) => component.type === 'apex_class' && component.tags.includes('test'));

  for (const component of components) {
    const content = component.paths.map((path) => fileByPath.get(path)?.content || '').join('\n');

    if (component.type === 'apex_class' || component.type === 'apex_trigger') {
      risks.push(...detectApexRisks(component, content, apexTests));
    }
    if (component.type === 'flow') {
      risks.push(...detectFlowRisks(component, content));
    }
    if (component.type === 'permission_set' || component.type === 'profile') {
      risks.push(...detectPermissionRisks(component, content));
    }
    if (component.type === 'lwc_component' || component.type === 'aura_component') {
      risks.push(...detectLightningRisks(component, content));
    }
  }

  return risks;
}

function risk(
  component: SalesforceMetadataComponent,
  severity: SalesforceRiskSeverity,
  category: SalesforceMetadataRisk['category'],
  title: string,
  detail: string,
  recommendation: string,
  evidence?: string,
  options: {
    ruleId?: string;
    confidence?: number;
    evidenceSpans?: SalesforceMetadataRisk['evidenceSpans'];
    evidenceDetails?: SalesforceSignalEvidenceDetail[];
    docTopicIds?: string[];
    limitations?: string[];
    triageAction?: SalesforceMetadataRisk['triageAction'];
  } = {},
): SalesforceMetadataRisk {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ruleId = options.ruleId || `${category}.${slug}`;
  return {
    id: `${component.id}:${slug}`,
    ruleId,
    severity,
    category,
    componentId: component.id,
    componentName: component.name,
    componentType: component.type,
    path: component.path,
    title,
    detail,
    recommendation,
    evidence,
    confidence: options.confidence ?? defaultRiskConfidence(severity),
    evidenceSpans: options.evidenceSpans || [],
    evidenceDetails: options.evidenceDetails || [],
    docTopicIds: options.docTopicIds || RISK_DOC_TOPIC_IDS[ruleId] || [],
    limitations: options.limitations || ['Static metadata signal only; confirm against current Salesforce documentation and org/runtime context before treating as a final finding.'],
    triageAction: options.triageAction || (severity === 'critical' || severity === 'high' ? 'plan_remediation' : 'verify_with_docs'),
  };
}

function defaultRiskConfidence(severity: SalesforceRiskSeverity): number {
  if (severity === 'critical') return 0.82;
  if (severity === 'high') return 0.78;
  if (severity === 'medium') return 0.68;
  return 0.58;
}

function evidenceSpanForPattern(
  component: SalesforceMetadataComponent,
  content: string,
  pattern: RegExp,
  fallbackSnippet?: string,
): SalesforceMetadataRisk['evidenceSpans'] {
  const lines = content.split(/\r?\n/);
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  for (let index = 0; index < lines.length; index += 1) {
    globalPattern.lastIndex = 0;
    if (globalPattern.test(lines[index])) {
      return [{
        path: component.path,
        startLine: index + 1,
        endLine: index + 1,
        snippet: lines[index].trim().slice(0, 240) || fallbackSnippet || pattern.source,
      }];
    }
  }
  return fallbackSnippet
    ? [{
        path: component.path,
        startLine: 1,
        endLine: 1,
        snippet: fallbackSnippet,
      }]
    : [];
}

function lineNumberForOffset(content: string, offset: number): number {
  if (offset <= 0) return 1;
  return content.slice(0, offset).split(/\r?\n/).length;
}

function apexBlockEvidenceDetails(
  component: SalesforceMetadataComponent,
  content: string,
  innerPattern: RegExp,
  label: string,
): SalesforceSignalEvidenceDetail[] {
  const blockPattern = /\b(?:for|while)\s*\([^)]*\)\s*\{[\s\S]{0,1600}?\}/gi;
  const details: SalesforceSignalEvidenceDetail[] = [];
  for (const match of content.matchAll(blockPattern)) {
    const block = match[0];
    innerPattern.lastIndex = 0;
    if (!innerPattern.test(block)) continue;
    const startLine = lineNumberForOffset(content, match.index || 0);
    details.push({
      kind: 'apex_block',
      label,
      type: 'loop',
      path: component.path,
      startLine,
      endLine: startLine + lineCount(block) - 1,
      snippet: block.replace(/\s+/g, ' ').trim().slice(0, 500),
      attributes: {
        blockKind: /^\s*while\b/i.test(block) ? 'while' : 'for',
      },
    });
    if (details.length >= 5) break;
  }
  return details;
}

function metadataElementEvidenceDetail(
  component: SalesforceMetadataComponent,
  content: string,
  pattern: RegExp,
  label: string,
  type: string,
): SalesforceSignalEvidenceDetail[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  const match = globalPattern.exec(content);
  if (!match) return [];
  const startLine = lineNumberForOffset(content, match.index);
  return [{
    kind: 'metadata_element',
    label,
    type,
    path: component.path,
    startLine,
    endLine: startLine + lineCount(match[0]) - 1,
    snippet: match[0].replace(/\s+/g, ' ').trim().slice(0, 500),
  }];
}

function extractXmlTagText(block: string, tagName: string): string | undefined {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.replace(/\s+/g, ' ').trim();
}

function flowElementEvidenceDetails(
  component: SalesforceMetadataComponent,
  content: string,
  tagNames: string[],
  options: { requireMissingFaultConnector?: boolean } = {},
): SalesforceSignalEvidenceDetail[] {
  const details: SalesforceSignalEvidenceDetail[] = [];
  for (const tagName of tagNames) {
    const blockPattern = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, 'gi');
    for (const match of content.matchAll(blockPattern)) {
      const block = match[0];
      const hasFaultConnector = /<faultConnector>/i.test(block);
      if (options.requireMissingFaultConnector && hasFaultConnector) continue;
      const startLine = lineNumberForOffset(content, match.index || 0);
      const name = extractXmlTagText(block, 'name');
      const label = extractXmlTagText(block, 'label');
      const subflowName = tagName === 'subflows' ? extractXmlTagText(block, 'flowName') : undefined;
      details.push({
        kind: 'flow_element',
        label: label || name || subflowName || tagName,
        type: tagName,
        path: component.path,
        startLine,
        endLine: startLine + lineCount(block) - 1,
        snippet: block.replace(/\s+/g, ' ').trim().slice(0, 500),
        attributes: {
          elementName: name || '',
          flowName: subflowName || '',
          hasFaultConnector,
        },
      });
      if (details.length >= 12) return details;
    }
  }
  return details;
}

function detectApexRisks(
  component: SalesforceMetadataComponent,
  content: string,
  apexTests: SalesforceMetadataComponent[],
): SalesforceMetadataRisk[] {
  const risks: SalesforceMetadataRisk[] = [];
  const loopBlocks = content.match(/\b(?:for|while)\s*\([^)]*\)\s*\{[\s\S]{0,1600}?\}/gi) || [];
  if (loopBlocks.some((block) => /\bSELECT\b[\s\S]{0,500}\bFROM\b/i.test(block))) {
    risks.push(risk(component, 'high', 'performance', 'SOQL query inside loop', 'Apex appears to issue SOQL from inside a loop, which can exhaust governor limits at scale.', 'Bulkify by collecting IDs first, querying once outside the loop, and using maps for lookup.', 'SOQL found in loop block', {
      ruleId: 'apex.soql-in-loop',
      evidenceSpans: evidenceSpanForPattern(component, content, /\bSELECT\b/i, 'SOQL found in loop block'),
      evidenceDetails: apexBlockEvidenceDetails(component, content, /\bSELECT\b[\s\S]{0,500}\bFROM\b/i, 'Loop block containing SOQL'),
    }));
  }
  if (loopBlocks.some((block) => /\b(insert|update|delete|upsert|merge)\b/i.test(block))) {
    risks.push(risk(component, 'high', 'performance', 'DML inside loop', 'Apex appears to run DML from inside a loop, which can exhaust governor limits.', 'Accumulate records in lists and perform one DML operation after the loop.', 'DML keyword found in loop block', {
      ruleId: 'apex.dml-in-loop',
      evidenceSpans: evidenceSpanForPattern(component, content, /\b(insert|update|delete|upsert|merge)\b/i, 'DML keyword found in loop block'),
      evidenceDetails: apexBlockEvidenceDetails(component, content, /\b(insert|update|delete|upsert|merge)\b/i, 'Loop block containing DML'),
    }));
  }
  if (/\bwithout\s+sharing\b/i.test(content)) {
    risks.push(risk(component, 'high', 'security', 'Runs without sharing', 'The component explicitly bypasses record sharing rules.', 'Confirm this is required; otherwise use with sharing or inherited sharing and document the access model.', 'without sharing', {
      ruleId: 'apex.without-sharing',
      evidenceSpans: evidenceSpanForPattern(component, content, /\bwithout\s+sharing\b/i, 'without sharing'),
      evidenceDetails: metadataElementEvidenceDetail(component, content, /\bwithout\s+sharing\b/i, 'Apex sharing declaration', 'sharing_declaration'),
      triageAction: 'verify_in_org',
    }));
  } else if (component.type === 'apex_class' && !/@isTest/i.test(content) && !/\b(with|inherited)\s+sharing\b/i.test(content)) {
    risks.push(risk(component, 'medium', 'security', 'No explicit sharing mode', 'The Apex class does not declare with sharing or inherited sharing.', 'Declare an explicit sharing mode so security behavior is intentional and reviewable.', undefined, {
      ruleId: 'apex.no-explicit-sharing',
      confidence: 0.62,
      triageAction: 'verify_with_docs',
    }));
  }
  if (/\bseeAllData\s*=\s*true\b/i.test(content)) {
    risks.push(risk(component, 'high', 'testability', 'Test depends on org data', 'A test uses seeAllData=true, which makes results environment-dependent.', 'Create test data inside the test and remove seeAllData=true.', 'seeAllData=true', {
      ruleId: 'apex.see-all-data',
      evidenceSpans: evidenceSpanForPattern(component, content, /\bseeAllData\s*=\s*true\b/i, 'seeAllData=true'),
      evidenceDetails: metadataElementEvidenceDetail(component, content, /\bseeAllData\s*=\s*true\b/i, 'seeAllData test annotation', 'test_annotation'),
    }));
  }
  if (/\bSystem\.debug\s*\(/i.test(content)) {
    risks.push(risk(component, 'low', 'maintainability', 'Debug logging left in Apex', 'System.debug calls can expose sensitive values in logs and add noise during troubleshooting.', 'Remove or gate debug statements behind a controlled logging strategy.', 'System.debug', {
      ruleId: 'apex.system-debug',
      evidenceSpans: evidenceSpanForPattern(component, content, /\bSystem\.debug\s*\(/i, 'System.debug'),
      triageAction: 'review',
    }));
  }
  if (/\b[a-zA-Z0-9]{3}['"]?\s*[:=]\s*['"]00[0-9A-Za-z]{13,16}['"]/i.test(content) || /['"]00[0-9A-Za-z]{13,16}['"]/i.test(content)) {
    risks.push(risk(component, 'medium', 'deployment', 'Hard-coded Salesforce ID', 'A hard-coded Salesforce ID can break across sandboxes, packaging, or production orgs.', 'Resolve records by stable developer names, external IDs, custom metadata, or configuration.', '00* ID literal', {
      ruleId: 'apex.hard-coded-id',
      evidenceSpans: evidenceSpanForPattern(component, content, /['"]00[0-9A-Za-z]{13,16}['"]/i, '00* ID literal'),
    }));
  }
  if (component.type === 'apex_trigger' && component.lineCount > 80) {
    risks.push(risk(component, 'medium', 'maintainability', 'Large trigger body', 'The trigger contains enough code to make ordering, recursion, and test setup harder to reason about.', 'Move business logic into a handler/service layer and keep the trigger as an event router.', undefined, {
      ruleId: 'apex.large-trigger',
      confidence: 0.6,
      triageAction: 'review',
    }));
  }
  if (component.type === 'apex_class' && !component.tags.includes('test')) {
    const coveredByTest = apexTests.some((test) => test.name.toLowerCase().includes(component.name.toLowerCase()));
    if (!coveredByTest) {
      risks.push(risk(component, 'medium', 'testability', 'No obvious companion test class', 'No test class name appears to target this Apex class.', 'Add or rename tests so ownership and coverage are obvious to reviewers and CI.', undefined, {
        ruleId: 'apex.no-companion-test',
        confidence: 0.55,
        limitations: ['Name-based static signal only; actual coverage must be verified with org test coverage or CI results.'],
        triageAction: 'verify_in_org',
      }));
    }
  }
  if (component.tags.includes('test') && !/\bSystem\.assert(?:Equals|NotEquals)?\s*\(/i.test(content) && !/\bAssert\./i.test(content)) {
    risks.push(risk(component, 'medium', 'testability', 'Test lacks assertions', 'The test appears to exercise code without asserting outcomes.', 'Add assertions for state changes, returned values, errors, and security expectations.', undefined, {
      ruleId: 'apex.test-lacks-assertions',
      confidence: 0.66,
      evidenceDetails: metadataElementEvidenceDetail(component, content, /@isTest|\btestMethod\b/i, 'Test declaration without detected assertions', 'test_declaration'),
      triageAction: 'plan_remediation',
    }));
  }
  return risks;
}

function detectFlowRisks(component: SalesforceMetadataComponent, content: string): SalesforceMetadataRisk[] {
  const risks: SalesforceMetadataRisk[] = [];
  if (/<status>Active<\/status>/i.test(content) && !/<faultConnector>/i.test(content)) {
    risks.push(risk(component, 'medium', 'automation', 'Active flow lacks visible fault paths', 'The active flow does not appear to define fault connectors.', 'Add fault paths for data mutations, invocable actions, callouts, and user-facing error handling.', undefined, {
      ruleId: 'flow.active-no-fault-path',
      evidenceSpans: evidenceSpanForPattern(component, content, /<status>Active<\/status>/i, '<status>Active</status>'),
      evidenceDetails: flowElementEvidenceDetails(component, content, ['recordCreates', 'recordUpdates', 'recordDeletes', 'actionCalls', 'apexPluginCalls', 'subflows'], { requireMissingFaultConnector: true }),
      confidence: 0.64,
      limitations: ['Static XML signal only; Flow Builder/runtime fault handling and subflow behavior should be verified.'],
      triageAction: 'verify_with_docs',
    }));
  }
  if (/<recordUpdates>|<recordCreates>|<recordDeletes>/i.test(content) && /<processType>AutoLaunchedFlow<\/processType>/i.test(content)) {
    risks.push(risk(component, 'medium', 'automation', 'Autolaunched flow mutates records', 'Autolaunched record mutations can recurse or interact unexpectedly with Apex/triggers.', 'Document entry criteria, recursion controls, and related automation order before changes.', undefined, {
      ruleId: 'flow.autolaunched-mutates-records',
      evidenceSpans: evidenceSpanForPattern(component, content, /<recordUpdates>|<recordCreates>|<recordDeletes>/i, 'record mutation element'),
      evidenceDetails: flowElementEvidenceDetails(component, content, ['recordCreates', 'recordUpdates', 'recordDeletes', 'subflows']),
      triageAction: 'verify_in_org',
    }));
  }
  return risks;
}

function detectPermissionRisks(component: SalesforceMetadataComponent, content: string): SalesforceMetadataRisk[] {
  const risks: SalesforceMetadataRisk[] = [];
  const powerfulPermissions = ['ModifyAllData', 'ViewAllData', 'AuthorApex', 'CustomizeApplication', 'ManageUsers'];
  const userPermissionBlocks = content.match(/<userPermissions>[\s\S]*?<\/userPermissions>/gi) || [];
  for (const permission of powerfulPermissions) {
    const enabled = userPermissionBlocks.some((block) =>
      new RegExp(`<name>${permission}</name>`, 'i').test(block) && /<enabled>true<\/enabled>/i.test(block)
    );
    if (enabled) {
      risks.push(risk(component, permission === 'ModifyAllData' ? 'critical' : 'high', 'security', `Powerful permission enabled: ${permission}`, `${permission} materially expands org access or configuration authority.`, 'Confirm least-privilege justification and isolate this permission in a tightly governed permission set.', permission, {
        ruleId: 'permissions.powerful-permission',
        evidenceSpans: evidenceSpanForPattern(component, content, new RegExp(`<name>${permission}</name>`, 'i'), permission),
        evidenceDetails: metadataElementEvidenceDetail(component, content, new RegExp(`<userPermissions>[\\s\\S]*?<name>${permission}</name>[\\s\\S]*?<enabled>true<\\/enabled>[\\s\\S]*?<\\/userPermissions>`, 'i'), `Enabled permission ${permission}`, 'user_permission'),
        triageAction: 'verify_in_org',
      }));
    }
  }
  if (/<allowDelete>true<\/allowDelete>/i.test(content) || /<modifyAllRecords>true<\/modifyAllRecords>/i.test(content)) {
    risks.push(risk(component, 'high', 'security', 'Broad object-level data access', 'Object permissions include delete or modify-all style access.', 'Review assigned users and narrow CRUD/FLS permissions to job-required access.', undefined, {
      ruleId: 'permissions.broad-object-access',
      evidenceSpans: evidenceSpanForPattern(component, content, /<allowDelete>true<\/allowDelete>|<modifyAllRecords>true<\/modifyAllRecords>/i, 'broad object permission'),
      evidenceDetails: metadataElementEvidenceDetail(component, content, /<objectPermissions>[\s\S]*?(<allowDelete>true<\/allowDelete>|<modifyAllRecords>true<\/modifyAllRecords>)[\s\S]*?<\/objectPermissions>/i, 'Broad object permission block', 'object_permission'),
      triageAction: 'verify_in_org',
    }));
  }
  return risks;
}

function detectLightningRisks(component: SalesforceMetadataComponent, content: string): SalesforceMetadataRisk[] {
  const risks: SalesforceMetadataRisk[] = [];
  if (/lwc:dom=["']manual["']|innerHTML\s*=|dangerouslySetInnerHTML/i.test(content)) {
    risks.push(risk(component, 'medium', 'security', 'Manual DOM injection surface', 'The component appears to manually inject or manipulate DOM content.', 'Validate sanitization and avoid rendering untrusted data as HTML.', undefined, {
      ruleId: 'lightning.manual-dom-injection',
      evidenceSpans: evidenceSpanForPattern(component, content, /lwc:dom=["']manual["']|innerHTML\s*=|dangerouslySetInnerHTML/i, 'manual DOM injection surface'),
      evidenceDetails: metadataElementEvidenceDetail(component, content, /lwc:dom=["']manual["']|innerHTML\s*=|dangerouslySetInnerHTML/i, 'Manual DOM injection expression', 'dom_injection'),
      triageAction: 'verify_with_docs',
    }));
  }
  return risks;
}

export function summarizeSalesforceIndex(index: SalesforceMetadataIndex): string {
  const typeLines = Object.entries(index.sourceSummary.recognizedTypes)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `- ${COMPONENT_TYPE_LABELS[type as SalesforceComponentType]}: ${count}`)
    .join('\n');

  const riskCounts = index.risks.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {} as Record<SalesforceRiskSeverity, number>);

  return [
    'Salesforce metadata audit index built.',
    `Files scanned: ${index.sourceSummary.fileCount}`,
    `Components indexed: ${index.sourceSummary.componentCount}`,
    `Dependencies inferred: ${index.dependencies.length}`,
    `Static metadata signals requiring docs/AI review: ${index.risks.length} (${riskCounts.critical || 0} critical, ${riskCounts.high || 0} high, ${riskCounts.medium || 0} medium, ${riskCounts.low || 0} low)`,
    index.sourceSummary.insightPacketCount > 0
      ? `Imported agent evidence: ${index.sourceSummary.importedFindingCount} finding${index.sourceSummary.importedFindingCount === 1 ? '' : 's'} across ${index.sourceSummary.insightPacketCount} packet${index.sourceSummary.insightPacketCount === 1 ? '' : 's'}`
      : '',
    '',
    typeLines || '- No recognized Salesforce metadata components found.',
    '',
    `Safety boundary: ${index.sourceSummary.safetyBoundary}`,
  ].join('\n');
}

export function searchSalesforceMetadata(index: SalesforceMetadataIndex, query: string): SalesforceMetadataComponent[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return index.components.slice(0, 25);
  return index.components
    .filter((component) => [
      component.name,
      component.type,
      component.path,
      component.tags.join(' '),
      component.references.map((reference) => reference.name).join(' '),
    ].join(' ').toLowerCase().includes(normalized))
    .slice(0, 50);
}

export function findSalesforceComponent(index: SalesforceMetadataIndex, componentName: string): SalesforceMetadataComponent | null {
  const normalized = componentName.trim().toLowerCase();
  return index.components.find((component) => component.id.toLowerCase() === normalized || component.name.toLowerCase() === normalized)
    ?? index.components.find((component) => component.name.toLowerCase().includes(normalized))
    ?? null;
}

export function buildSalesforceInventory(index: SalesforceMetadataIndex): string {
  return JSON.stringify({
    generatedAt: index.generatedAt,
    sourceSummary: index.sourceSummary,
    components: index.components,
    documentationTopics: index.documentationTopics,
    insightPackets: index.insightPackets,
    importedFindings: index.importedFindings,
  }, null, 2);
}

export function buildSalesforceDocumentationTopics(index: SalesforceMetadataIndex, query?: string): string {
  const topics = buildSalesforceDocumentationTopicsFromSignals(
    index.components,
    index.risks,
    index.importedFindings,
    query,
  );
  const componentTypes = unique(index.components.map((component) => component.type));
  const apiVersions = unique(index.components.map((component) => component.apiVersion).filter((value): value is string => Boolean(value)));
  const riskSignalIds = unique(index.risks.map((riskItem) => riskItem.ruleId));
  return JSON.stringify({
    version: 1,
    generatedAt: index.generatedAt,
    releaseContext: 'derive_at_lookup_time',
    officialSourcePolicy: {
      allowedDomains: ['*.salesforce.com'],
      note: 'salesforce_docs_lookup must reject non-official URLs by default.',
    },
    topics,
    componentTypes,
    apiVersions,
    riskSignalIds,
    lookupArgs: {
      topics,
      componentTypes,
      apiVersions,
      riskSignalIds,
      maxResultsPerTopic: 2,
    },
  }, null, 2);
}

export function buildSalesforceDependencyMap(index: SalesforceMetadataIndex): string {
  return JSON.stringify({
    generatedAt: index.generatedAt,
    nodes: index.components.map((component) => ({
      id: component.id,
      name: component.name,
      type: component.type,
      path: component.path,
      tags: component.tags,
      importedFindingCount: index.importedFindings.filter((finding) => finding.matchedComponentIds.includes(component.id)).length,
    })),
    edges: index.dependencies,
    importedFindingEdges: index.importedFindings.flatMap((finding) =>
      finding.matchedComponentIds.map((componentId) => ({
        sourceId: `insight:${finding.packetRunId}:${finding.id}`,
        targetId: componentId,
        relationship: 'flags',
        severity: finding.severity,
        audienceImpact: finding.audienceImpact,
      }))
    ),
  }, null, 2);
}

export function buildSalesforceAuditReport(index: SalesforceMetadataIndex): string {
  const risksBySeverity = index.risks.reduce((acc, item) => {
    const list = acc.get(item.severity) || [];
    list.push(item);
    acc.set(item.severity, list);
    return acc;
  }, new Map<SalesforceRiskSeverity, SalesforceMetadataRisk[]>());

  const sections: string[] = [
    '# Salesforce Metadata Audit',
    '',
    summarizeSalesforceIndex(index),
    '',
    '## Component Inventory',
    '',
    ...Object.entries(index.sourceSummary.recognizedTypes)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `- **${COMPONENT_TYPE_LABELS[type as SalesforceComponentType]}**: ${count}`),
    '',
    '## Highest Priority Static Signals',
    '',
  ];

  for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
    const items = risksBySeverity.get(severity) || [];
    if (items.length === 0) continue;
    sections.push(`### ${severity.toUpperCase()}`, '');
    for (const item of items.slice(0, 20)) {
      sections.push(`- **${item.title}** (${item.componentName}, ${item.path})`);
      sections.push(`  ${item.detail}`);
      sections.push(`  Evidence grade: rule ${item.ruleId}, confidence ${item.confidence.toFixed(2)}, docs topics: ${item.docTopicIds.join(', ') || 'none'}`);
      sections.push(`  Recommendation: ${item.recommendation}`);
    }
    sections.push('');
  }

  if (index.risks.length === 0) {
    sections.push('No static metadata signals fired. This does not prove the org is risk-free; it means the current deterministic rules did not detect obvious issues.');
  }

  if (index.importedFindings.length > 0) {
    sections.push('', '## Imported Agent Evidence', '');
    for (const finding of index.importedFindings.slice(0, 20)) {
      sections.push(`- **${finding.title}** (${finding.severity}, ${finding.audienceImpact})`);
      sections.push(`  ${finding.summary}`);
      sections.push(`  Evidence source: ${finding.sourceType}${finding.sourceType === 'agent_summary' ? ' (requires raw SOQL/describe/docs verification before treating as org fact)' : ''}`);
      sections.push(`  Matched components: ${finding.matchedComponentNames.join(', ') || 'none'}`);
      sections.push(`  Next step: ${finding.recommendedNextStep}`);
    }
  }

  sections.push('## Product Boundary', '', index.sourceSummary.safetyBoundary);
  return sections.join('\n');
}

export function buildSalesforceRemediationBacklog(index: SalesforceMetadataIndex): string {
  const deterministicTasks = index.risks.map((item) => ({
    id: item.id,
    source: 'metadata_audit' as const,
    signalId: item.ruleId,
    ruleId: item.ruleId,
    componentType: item.componentType,
    priority: item.severity,
    category: item.category,
    title: item.title,
    targetComponent: item.componentName,
    targetPath: item.path,
    desiredChange: item.recommendation,
    confidence: item.confidence,
    docTopicIds: item.docTopicIds,
    evidenceSpans: item.evidenceSpans,
    evidenceDetails: item.evidenceDetails,
    limitations: item.limitations,
    triageAction: item.triageAction,
    evidenceGrade: {
      ruleId: item.ruleId,
      confidence: item.confidence,
      evidenceSpans: item.evidenceSpans,
      evidenceDetails: item.evidenceDetails,
      docTopicIds: item.docTopicIds,
      limitations: item.limitations,
      triageAction: item.triageAction,
    },
    acceptanceCriteria: [
      'Risk condition is no longer present in static metadata review.',
      'Current official Salesforce documentation evidence has been reviewed for this signal.',
      'Existing behavior is covered by targeted tests or documented manual validation.',
      'Change is reviewed in a Salesforce DX branch before any deployment.',
    ],
    testGuidance: buildTestGuidance(item),
  }));

  const importedTasks = index.importedFindings.map((finding) => ({
    id: `insight:${finding.packetRunId}:${finding.id}`,
    source: 'agent_insight_packet' as const,
    priority: finding.severity,
    category: finding.audienceImpact,
    title: finding.title,
    targetComponents: finding.matchedComponentNames,
    targetPaths: finding.affectedPaths,
    desiredChange: finding.recommendedNextStep,
    sourceType: finding.sourceType,
    evidenceClaims: finding.evidenceClaims || [],
    runtimeQueries: finding.runtimeQueries || [],
    describeResults: finding.describeResults || [],
    documentationRefs: finding.documentationRefs || [],
    limitations: finding.sourceType === 'agent_summary'
      ? ['Imported agent finding did not include raw runtime evidence; verify before using as a final org-state claim.']
      : [],
    acceptanceCriteria: [
      finding.summary,
      'Evidence from the imported insight packet has been reviewed against the source metadata.',
      finding.sourceType === 'agent_summary'
        ? 'Any org runtime/setup claim has been verified with SOQL, describe output, or current official Salesforce documentation.'
        : 'Structured packet evidence has been reconciled against metadata and official Salesforce documentation.',
      'Implementation remains source-controlled and reviewable in the local workspace before any deployment.',
    ],
    testGuidance: ['Use the packet evidence refs as starting context.', 'Run targeted Salesforce validation for matched components.'],
  }));

  return JSON.stringify([...deterministicTasks, ...importedTasks], null, 2);
}

export function buildSalesforceSignalEvidence(index: SalesforceMetadataIndex): string {
  const byRuleId = index.risks.reduce((acc, item) => {
    const existing = acc[item.ruleId] || {
      ruleId: item.ruleId,
      count: 0,
      severities: {} as Partial<Record<SalesforceRiskSeverity, number>>,
      componentTypes: {} as Partial<Record<SalesforceComponentType, number>>,
      docTopicIds: new Set<string>(),
    };
    existing.count += 1;
    existing.severities[item.severity] = (existing.severities[item.severity] || 0) + 1;
    existing.componentTypes[item.componentType] = (existing.componentTypes[item.componentType] || 0) + 1;
    item.docTopicIds.forEach((topicId) => existing.docTopicIds.add(topicId));
    acc[item.ruleId] = existing;
    return acc;
  }, {} as Record<string, {
    ruleId: string;
    count: number;
    severities: Partial<Record<SalesforceRiskSeverity, number>>;
    componentTypes: Partial<Record<SalesforceComponentType, number>>;
    docTopicIds: Set<string>;
  }>);

  return JSON.stringify({
    version: 1,
    generatedAt: index.generatedAt,
    summary: {
      signalCount: index.risks.length,
      signalsWithLineSpans: index.risks.filter((item) => item.evidenceSpans.length > 0).length,
      signalsWithDrilldownDetails: index.risks.filter((item) => item.evidenceDetails.length > 0).length,
      flowSignals: index.risks.filter((item) => item.componentType === 'flow').length,
      apexSignals: index.risks.filter((item) => item.componentType === 'apex_class' || item.componentType === 'apex_trigger').length,
    },
    byRuleId: Object.values(byRuleId)
      .map((item) => ({
        ...item,
        docTopicIds: Array.from(item.docTopicIds).sort(),
      }))
      .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId)),
    signals: index.risks.map((item) => ({
      id: item.id,
      ruleId: item.ruleId,
      severity: item.severity,
      category: item.category,
      componentId: item.componentId,
      componentName: item.componentName,
      componentType: item.componentType,
      path: item.path,
      title: item.title,
      detail: item.detail,
      recommendation: item.recommendation,
      confidence: item.confidence,
      docTopicIds: item.docTopicIds,
      limitations: item.limitations,
      triageAction: item.triageAction,
      evidenceSpans: item.evidenceSpans,
      evidenceDetails: item.evidenceDetails,
    })),
  }, null, 2);
}

export function buildSalesforceEvidenceLedger(index: SalesforceMetadataIndex): string {
  const bySourceType = index.evidenceLedger.reduce((acc, claim) => {
    acc[claim.sourceType] = (acc[claim.sourceType] || 0) + 1;
    return acc;
  }, {} as Partial<Record<SalesforceEvidenceSourceType, number>>);

  return JSON.stringify({
    version: 1,
    generatedAt: index.generatedAt,
    summary: {
      claimCount: index.evidenceLedger.length,
      bySourceType,
      agentSummaryClaimsRequireVerification: index.evidenceLedger.filter((claim) => claim.sourceType === 'agent_summary').length,
      runtimeUnverifiedClaims: index.evidenceLedger.filter((claim) => claim.sourceType === 'runtime_unverified').length,
    },
    sourceTypePolicy: {
      metadata: 'Claim is grounded in uploaded Salesforce source metadata.',
      soql: 'Claim is grounded in a read-only org query supplied by an imported packet.',
      describe: 'Claim is grounded in describe/schema evidence supplied by an imported packet.',
      docs: 'Claim is grounded in official Salesforce documentation evidence.',
      agent_summary: 'Claim came from an imported agent summary without raw query/describe evidence and must be verified before final use.',
      inference: 'Claim is an analytical inference and must be labeled as such.',
      runtime_unverified: 'Claim depends on org runtime/setup state not available in uploaded metadata.',
    },
    claims: index.evidenceLedger,
  }, null, 2);
}

export function buildSalesforceFlowDrilldowns(index: SalesforceMetadataIndex): string {
  return JSON.stringify({
    version: 1,
    generatedAt: index.generatedAt,
    summary: {
      flowCount: index.components.filter((component) => component.type === 'flow').length,
      drilldownCount: index.flowDrilldowns.length,
      mutatingElementsWithoutFaults: index.flowDrilldowns.reduce((sum, item) => sum + item.mutatingElementsWithoutFaults.length, 0),
      subflowReferences: unique(index.flowDrilldowns.flatMap((item) => item.subflowReferences)).length,
    },
    drilldowns: index.flowDrilldowns,
  }, null, 2);
}

export function buildSalesforceApexDrilldowns(index: SalesforceMetadataIndex): string {
  return JSON.stringify({
    version: 1,
    generatedAt: index.generatedAt,
    summary: {
      apexComponentCount: index.components.filter((component) => component.type === 'apex_class' || component.type === 'apex_trigger').length,
      drilldownCount: index.apexDrilldowns.length,
      methodSpanCount: index.apexDrilldowns.reduce((sum, item) => sum + item.methodSpans.length, 0),
      emailReferenceCount: index.apexDrilldowns.reduce((sum, item) => sum + item.emailReferences.length, 0),
    },
    drilldowns: index.apexDrilldowns,
  }, null, 2);
}

export function buildSalesforceFeatureReferenceMap(index: SalesforceMetadataIndex): string {
  return JSON.stringify(index.featureReferenceMap, null, 2);
}

function buildDependencyCountsByComponent(index: SalesforceMetadataIndex): Map<string, number> {
  const counts = new Map<string, number>();
  for (const dependency of index.dependencies) {
    counts.set(dependency.sourceId, (counts.get(dependency.sourceId) || 0) + 1);
    if (dependency.targetId !== dependency.sourceId) {
      counts.set(dependency.targetId, (counts.get(dependency.targetId) || 0) + 1);
    }
  }
  return counts;
}

function groupRisksByComponent(index: SalesforceMetadataIndex): Map<string, SalesforceMetadataRisk[]> {
  const groups = new Map<string, SalesforceMetadataRisk[]>();
  for (const item of index.risks) {
    groups.set(item.componentId, [...(groups.get(item.componentId) || []), item]);
  }
  return groups;
}

function buildImportedFindingCountsByComponent(index: SalesforceMetadataIndex): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of index.importedFindings) {
    for (const componentId of finding.matchedComponentIds) {
      counts.set(componentId, (counts.get(componentId) || 0) + 1);
    }
  }
  return counts;
}

export function buildSalesforceWorkbenchSummary(index: SalesforceMetadataIndex): string {
  const riskCounts = index.risks.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {} as Partial<Record<SalesforceRiskSeverity, number>>);
  const topSignalsByRule = Object.values(index.risks.reduce((acc, item) => {
    const existing = acc[item.ruleId] || {
      ruleId: item.ruleId,
      title: item.title,
      count: 0,
      highestSeverity: item.severity,
      componentTypes: new Set<SalesforceComponentType>(),
      docTopicIds: new Set<string>(),
    };
    existing.count += 1;
    if (RISK_ORDER[item.severity] < RISK_ORDER[existing.highestSeverity]) {
      existing.highestSeverity = item.severity;
      existing.title = item.title;
    }
    existing.componentTypes.add(item.componentType);
    item.docTopicIds.forEach((topicId) => existing.docTopicIds.add(topicId));
    acc[item.ruleId] = existing;
    return acc;
  }, {} as Record<string, {
    ruleId: string;
    title: string;
    count: number;
    highestSeverity: SalesforceRiskSeverity;
    componentTypes: Set<SalesforceComponentType>;
    docTopicIds: Set<string>;
  }>))
    .map((item) => ({
      ruleId: item.ruleId,
      title: item.title,
      count: item.count,
      highestSeverity: item.highestSeverity,
      componentTypes: Array.from(item.componentTypes).sort(),
      docTopicIds: Array.from(item.docTopicIds).sort(),
    }))
    .sort((a, b) => b.count - a.count || RISK_ORDER[a.highestSeverity] - RISK_ORDER[b.highestSeverity])
    .slice(0, 25);

  const dependencyCounts = buildDependencyCountsByComponent(index);
  const risksByComponent = groupRisksByComponent(index);
  const importedFindingCounts = buildImportedFindingCountsByComponent(index);
  const topComponents = index.components
    .map((component) => {
      const dependencyCount = dependencyCounts.get(component.id) || 0;
      const staticSignals = risksByComponent.get(component.id) || [];
      const importedFindingCount = importedFindingCounts.get(component.id) || 0;
      return {
        id: component.id,
        name: component.name,
        type: component.type,
        path: component.path,
        dependencyCount,
        staticSignalCount: staticSignals.length,
        importedFindingCount,
        highestSeverity: staticSignals
          .map((item) => item.severity)
          .sort((a, b) => RISK_ORDER[a] - RISK_ORDER[b])[0],
        score: dependencyCount + (staticSignals.length * 5) + (importedFindingCount * 4),
      };
    })
    .filter((component) => component.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 25);

  return JSON.stringify({
    version: 1,
    generatedAt: index.generatedAt,
    sourceSummary: index.sourceSummary,
    riskCounts,
    docsVerification: {
      status: index.documentationTopics.length > 0 ? 'pending_docs_lookup' : 'no_topics_generated',
      documentationTopicCount: index.documentationTopics.length,
      requiredArtifact: 'salesforce-doc-evidence.json',
      note: 'Run salesforce_docs_lookup with salesforce-doc-topics.json before final synthesis to convert pending topics into official documentation evidence.',
    },
    topSignalsByRule,
    topComponents,
    artifactMap: {
      componentIndex: 'salesforce-component-index.json',
      dependencyMap: 'salesforce-dependency-map.json',
      remediationBacklog: 'salesforce-remediation-backlog.json',
      signalEvidence: 'salesforce-signal-evidence.json',
      evidenceLedger: 'salesforce-evidence-ledger.json',
      flowDrilldowns: 'salesforce-flow-drilldowns.json',
      apexDrilldowns: 'salesforce-apex-drilldowns.json',
      featureReferenceMap: 'salesforce-feature-reference-map.json',
      documentationTopics: 'salesforce-doc-topics.json',
      documentationEvidence: 'salesforce-doc-evidence.json',
      stakeholderVisualPlan: 'salesforce-stakeholder-visual-artifacts.json',
      engineeringHandoff: 'salesforce-vscode-handoff.json',
    },
    limits: {
      stakeholderVisualPlanIsCapped: true,
      useDependencyMapForFullGraph: true,
    },
  }, null, 2);
}

export function buildSalesforceFeatureReadinessBrief(index: SalesforceMetadataIndex, goal?: string): string {
  const hotspots = index.components
    .map((component) => ({
      component,
      dependencyCount: index.dependencies.filter((dep) => dep.sourceId === component.id || dep.targetId === component.id).length,
      riskCount: index.risks.filter((riskItem) => riskItem.componentId === component.id).length,
    }))
    .sort((a, b) => (b.dependencyCount + b.riskCount) - (a.dependencyCount + a.riskCount))
    .slice(0, 10);

  return [
    '# Salesforce Feature Readiness Brief',
    '',
    goal ? `Feature or change goal: ${goal}` : 'Feature or change goal: not specified.',
    '',
    '## Areas To Inspect First',
    '',
    ...hotspots.map(({ component, dependencyCount, riskCount }) => `- **${component.name}** (${component.type}) - ${dependencyCount} dependency link(s), ${riskCount} risk finding(s), path: ${component.path}`),
    ...(index.importedFindings.length > 0
      ? [
          '',
          '## Agent Findings To Reconcile',
          '',
          ...index.importedFindings.slice(0, 10).map((finding) =>
            `- **${finding.title}** (${finding.audienceImpact}) - ${finding.matchedComponentNames.join(', ') || 'no component match'}; next step: ${finding.recommendedNextStep}`
          ),
        ]
      : []),
    '',
    '## Planning Guidance',
    '',
    '- Start with the dependency map before changing objects, fields, flows, or shared Apex services.',
    '- Convert audit findings into a branch-local implementation plan for a Salesforce DX workspace.',
    '- Keep deploy validation, Apex tests, and UAT in the Salesforce delivery pipeline.',
    '',
    '## Boundary',
    '',
    index.sourceSummary.safetyBoundary,
  ].join('\n');
}

interface SalesforceTroubleshootingCandidate {
  component: SalesforceMetadataComponent;
  score: number;
  reasons: string[];
  dependencyCount: number;
  riskCount: number;
}

export function buildSalesforceTroubleshootingBrief(index: SalesforceMetadataIndex, issue?: string): string {
  const issueText = issue?.trim() || '';
  const issueKinds = detectTroubleshootingIssueKinds(issueText);
  const candidates = findTroubleshootingCandidates(index, issueText);
  const relatedRisks = findRelatedTroubleshootingRisks(index, issueText, candidates);
  const relatedFindings = findRelatedTroubleshootingFindings(index, issueText, candidates);
  const startingPoints = candidates.length > 0
    ? candidates
    : index.components
        .map((component) => ({
          component,
          score: 0,
          reasons: ['Highest-risk or highest-dependency workspace component when no exact issue match was found.'],
          dependencyCount: index.dependencies.filter((dep) => dep.sourceId === component.id || dep.targetId === component.id).length,
          riskCount: index.risks.filter((riskItem) => riskItem.componentId === component.id).length,
        }))
        .sort((a, b) => (b.dependencyCount + b.riskCount) - (a.dependencyCount + a.riskCount))
        .slice(0, 8);

  return [
    '# Salesforce Troubleshooting Brief',
    '',
    issueText ? '## Reported Error Or Bug' : '## Reported Error Or Bug',
    '',
    issueText ? truncateForMarkdown(issueText, 3000) : 'No Flow error, Apex exception, or production bug report was provided. Ask the user to paste the observed error, stack trace, failed flow interview details, or end-user reproduction notes.',
    '',
    '## Detected Issue Shape',
    '',
    issueKinds.length > 0
      ? issueKinds.map((kind) => `- ${kind}`).join('\n')
      : '- No specific Flow, Apex, validation, access, or data-integrity signal was detected from the pasted text.',
    '',
    '## Likely Metadata Starting Points',
    '',
    startingPoints.length > 0
      ? startingPoints.map(formatTroubleshootingCandidate).join('\n')
      : '- No Salesforce metadata components were indexed from the upload.',
    '',
    '## Related Static Risk Signals',
    '',
    relatedRisks.length > 0
      ? relatedRisks.slice(0, 12).map((riskItem) => `- **${riskItem.title}** (${riskItem.severity}) on ${riskItem.componentName}: ${riskItem.detail} Recommendation: ${riskItem.recommendation}`).join('\n')
      : '- No deterministic risk rules directly matched the reported issue. This does not rule out a configuration, data, sharing, or runtime-only cause.',
    ...(relatedFindings.length > 0
      ? [
          '',
          '## Imported Agent Evidence To Reconcile',
          '',
          relatedFindings.slice(0, 10).map((finding) =>
            `- **${finding.title}** (${finding.severity}, ${finding.audienceImpact}) - matched components: ${finding.matchedComponentNames.join(', ') || 'none'}; next step: ${finding.recommendedNextStep}`
          ).join('\n'),
        ]
      : []),
    '',
    '## Read-Only Diagnostic Path',
    '',
    '- Start with the listed metadata paths and dependency links before forming a root-cause claim.',
    '- For Flow errors, inspect active flow entry criteria, element names, record updates/creates/deletes, invocable Apex, and missing fault paths.',
    '- For Apex exceptions, inspect the named class/trigger from the stack trace, then trace callers, SOQL/DML in loops, null assumptions, sharing mode, and companion tests.',
    '- For validation or production bugs, map the user action to validation rules, flows, triggers, field-level dependencies, and permission/profile exposure.',
    '- If the cause depends on live org state, use the optional VS Code agent enrichment prompt with Salesforce MCP/read-only SOQL so Symposium can import org-aware evidence.',
    '',
    '## Boundary',
    '',
    index.sourceSummary.safetyBoundary,
  ].join('\n');
}

function findTroubleshootingCandidates(index: SalesforceMetadataIndex, issueText: string): SalesforceTroubleshootingCandidate[] {
  const signals = extractTroubleshootingSignals(issueText);
  const normalizedIssue = issueText.toLowerCase();
  const issueKinds = detectTroubleshootingIssueKinds(issueText);

  return index.components
    .map((component) => {
      const reasons: string[] = [];
      let score = 0;
      const dependencyCount = index.dependencies.filter((dep) => dep.sourceId === component.id || dep.targetId === component.id).length;
      const riskCount = index.risks.filter((riskItem) => riskItem.componentId === component.id).length;
      const haystack = [
        component.name,
        component.type,
        component.path,
        component.tags.join(' '),
        component.references.map((reference) => reference.name).join(' '),
      ].join(' ').toLowerCase();
      const componentName = component.name.toLowerCase();

      if (componentName && normalizedIssue.includes(componentName)) {
        score += 14;
        reasons.push('Component name appears in the pasted issue.');
      }
      if (normalizedIssue.includes(component.path.toLowerCase())) {
        score += 12;
        reasons.push('Metadata path appears in the pasted issue.');
      }
      for (const signal of signals) {
        if (signal === componentName) {
          score += 10;
          reasons.push(`Exact issue signal matched ${component.name}.`);
        } else if (haystack.includes(signal)) {
          score += 3;
          reasons.push(`Issue signal matched metadata text: ${signal}.`);
        }
      }
      if (issueKinds.some((kind) => kind.includes('Flow')) && component.type === 'flow') score += 4;
      if (issueKinds.some((kind) => kind.includes('Apex')) && (component.type === 'apex_class' || component.type === 'apex_trigger')) score += 4;
      if (issueKinds.some((kind) => kind.includes('Validation')) && component.type === 'validation_rule') score += 4;
      if (issueKinds.some((kind) => kind.includes('Access')) && (component.type === 'permission_set' || component.type === 'profile')) score += 4;
      if (score > 0) {
        score += Math.min(dependencyCount, 4) + Math.min(riskCount * 2, 6);
      }

      return {
        component,
        score,
        reasons: Array.from(new Set(reasons)),
        dependencyCount,
        riskCount,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function formatTroubleshootingCandidate(candidate: SalesforceTroubleshootingCandidate): string {
  const references = candidate.component.references.map((reference) => reference.name).slice(0, 8);
  return [
    `- **${candidate.component.name}** (${candidate.component.type}) - ${candidate.component.path}`,
    `  Match reason: ${candidate.reasons.join('; ') || 'Workspace hotspot.'}`,
    `  Dependency links: ${candidate.dependencyCount}; static risks: ${candidate.riskCount}; references: ${references.join(', ') || 'none'}`,
  ].join('\n');
}

function findRelatedTroubleshootingRisks(
  index: SalesforceMetadataIndex,
  issueText: string,
  candidates: SalesforceTroubleshootingCandidate[],
): SalesforceMetadataRisk[] {
  const candidateIds = new Set(candidates.map((candidate) => candidate.component.id));
  const signals = extractTroubleshootingSignals(issueText);
  return index.risks
    .filter((riskItem) => {
      if (candidateIds.has(riskItem.componentId)) return true;
      const haystack = [
        riskItem.title,
        riskItem.detail,
        riskItem.recommendation,
        riskItem.componentName,
        riskItem.path,
      ].join(' ').toLowerCase();
      return signals.some((signal) => haystack.includes(signal));
    })
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function findRelatedTroubleshootingFindings(
  index: SalesforceMetadataIndex,
  issueText: string,
  candidates: SalesforceTroubleshootingCandidate[],
): SalesforceImportedInsightFinding[] {
  const candidateIds = new Set(candidates.map((candidate) => candidate.component.id));
  const signals = extractTroubleshootingSignals(issueText);
  return index.importedFindings.filter((finding) => {
    if (finding.matchedComponentIds.some((componentId) => candidateIds.has(componentId))) return true;
    const haystack = [
      finding.title,
      finding.summary,
      finding.recommendedNextStep,
      finding.affectedPaths.join(' '),
      finding.affectedComponents.join(' '),
      finding.matchedComponentNames.join(' '),
    ].join(' ').toLowerCase();
    return signals.some((signal) => haystack.includes(signal));
  });
}

function extractTroubleshootingSignals(issueText: string): string[] {
  const signals = new Set<string>();
  const add = (value?: string) => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized || normalized.length < 3 || TROUBLESHOOTING_STOP_WORDS.has(normalized)) return;
    signals.add(normalized);
  };

  for (const match of issueText.matchAll(/\bClass\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) add(match[1]);
  for (const match of issueText.matchAll(/\bTrigger\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) add(match[1]);
  for (const match of issueText.matchAll(/\b([A-Za-z][A-Za-z0-9_]*__c)\b/g)) add(match[1]);
  for (const match of issueText.matchAll(/\b([A-Za-z][A-Za-z0-9_]*(?:_[A-Za-z0-9]+)+)\b/g)) add(match[1]);
  for (const token of issueText.split(/[^A-Za-z0-9_]+/)) {
    if (token.length >= 5 || token.includes('__') || /[A-Z]/.test(token[0])) add(token);
  }
  return Array.from(signals).slice(0, 80);
}

const TROUBLESHOOTING_STOP_WORDS = new Set([
  'apex',
  'case',
  'class',
  'error',
  'exception',
  'cannot',
  'failed',
  'fails',
  'field',
  'flow',
  'line',
  'null',
  'record',
  'salesforce',
  'system',
  'trigger',
  'user',
]);

function detectTroubleshootingIssueKinds(issueText: string): string[] {
  const kinds: string[] = [];
  if (/flow|FLOW_ELEMENT_ERROR|FLOW_START_INTERVIEW|FLOW_VALUE_ASSIGNMENT/i.test(issueText)) {
    kinds.push('Flow or process automation failure');
  }
  if (/Class\.|Trigger\.|System\.[A-Za-z]+Exception|Apex|DmlException|NullPointerException|QueryException/i.test(issueText)) {
    kinds.push('Apex exception or trigger/class failure');
  }
  if (/FIELD_CUSTOM_VALIDATION_EXCEPTION|validation rule|ValidationRule|REQUIRED_FIELD_MISSING/i.test(issueText)) {
    kinds.push('Validation rule or required-field failure');
  }
  if (/INSUFFICIENT_ACCESS|permission|profile|FIELD_INTEGRITY_EXCEPTION|INVALID_CROSS_REFERENCE_KEY/i.test(issueText)) {
    kinds.push('Access, sharing, lookup, or data-integrity failure');
  }
  if (/production|prod|customer|end user|reported|bug|repro/i.test(issueText)) {
    kinds.push('Production bug report requiring source-to-runtime correlation');
  }
  return Array.from(new Set(kinds));
}

function severityRank(severity: SalesforceRiskSeverity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function truncateForMarkdown(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n\n[truncated]`;
}

export function buildSalesforceVsCodeHandoff(index: SalesforceMetadataIndex, goal?: string): SalesforceMetadataHandoff {
  const selectedRisks = index.risks.slice(0, 12);
  const selectedImportedFindings = index.importedFindings.slice(0, 12);
  const targetComponentIds = new Set([
    ...selectedRisks.map((item) => item.componentId),
    ...selectedImportedFindings.flatMap((finding) => finding.matchedComponentIds),
  ]);
  const targetComponents = index.components
    .filter((component) => targetComponentIds.has(component.id))
    .map((component) => ({
      id: component.id,
      name: component.name,
      type: component.type,
      paths: component.paths,
      reason: [
        ...selectedRisks.filter((item) => item.componentId === component.id).map((item) => item.title),
        ...selectedImportedFindings.filter((finding) => finding.matchedComponentIds.includes(component.id)).map((finding) => finding.title),
      ].join('; '),
    }));

  const remediationTasks = [
    ...selectedRisks.map((item) => ({
      id: item.id,
      priority: item.severity,
      title: item.title,
      targetComponents: [item.componentId],
      desiredChange: item.recommendation,
      acceptanceCriteria: [
        item.detail,
        'Implementation remains source-controlled and reviewable in the local workspace.',
        'No direct production org mutation is performed from this handoff.',
      ],
      testGuidance: buildTestGuidance(item),
    })),
    ...selectedImportedFindings.map((finding) => ({
      id: `insight:${finding.packetRunId}:${finding.id}`,
      priority: finding.severity,
      title: finding.title,
      targetComponents: finding.matchedComponentIds,
      desiredChange: finding.recommendedNextStep,
      acceptanceCriteria: [
        finding.summary,
        'Imported agent evidence has been reviewed against the source files.',
        'No direct production org mutation is performed from this handoff.',
      ],
      testGuidance: ['Inspect the packet evidence refs before editing.', 'Run targeted validation for affected metadata paths.'],
    })),
  ];

  const summary = goal
    ? `Create a Salesforce DX branch plan for: ${goal}`
    : 'Create a Salesforce DX remediation branch plan from the attached metadata audit.';

  return {
    version: 1,
    generatedAt: index.generatedAt,
    safetyBoundary: index.sourceSummary.safetyBoundary,
    summary,
    targetComponents,
    remediationTasks,
    vscodePrompts: {
      codex: [
        'You are working in a Salesforce DX workspace in your local editor.',
        'Use this handoff as planning context only; inspect the files before editing.',
        'If this handoff references imported Symposium insight packet evidence, verify the cited packet evidence before changing source.',
        'Implement changes in a branch, add or update Apex tests where applicable, and do not deploy directly to production.',
        goal ? `User goal: ${goal}` : '',
      ].filter(Boolean).join('\n'),
      claudeCode: [
        'Review the Salesforce metadata paths in this handoff, propose a minimal patch plan, then implement only after confirming affected files.',
        'Respect the audit boundary: source edits and local validation only; no org mutation or deployment commands unless the human explicitly runs them.',
      ].join('\n'),
    },
  };
}

export function buildSalesforceInsightPacketSummary(
  index: SalesforceMetadataIndex,
  invalidInsightPackets: SalesforceInvalidInsightPacket[] = [],
): string {
  return JSON.stringify({
    schema: {
      description: 'Insight packet import summary. Actual imported agent evidence entries are stored at the top-level importedFindings array; validPackets stores packet metadata and finding counts only.',
      keyPaths: {
        packetMetadata: 'validPackets[]',
        importedFindings: 'importedFindings[]',
        evidenceClaims: 'importedFindings[].evidenceClaims[]',
        runtimeQueries: 'importedFindings[].runtimeQueries[]',
        describeResults: 'importedFindings[].describeResults[]',
        matchedComponents: 'importedFindings[].matchedComponents[]',
        unmatchedAffectedPaths: 'importedFindings[].unmatchedAffectedPaths[]',
        invalidPackets: 'invalidPackets[]',
      },
      countSemantics: {
        deterministicMetadataRisks: 'Available in salesforce-metadata-audit-report.md and salesforce-remediation-backlog.json; these are auto-detected from metadata.',
        importedAgentFindings: 'Available here at importedFindings[]; these come from .symposium/salesforce-insights packets.',
        agentSummaryFindings: 'Imported findings with sourceType=agent_summary are hypotheses until raw SOQL/describe/docs evidence verifies the claim.',
      },
    },
    generatedAt: index.generatedAt,
    validPackets: index.insightPackets,
    invalidPackets: invalidInsightPackets,
    importedFindings: index.importedFindings,
    componentMappings: index.importedFindings.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      severity: finding.severity,
      audienceImpact: finding.audienceImpact,
      sourceType: finding.sourceType,
      observedAt: finding.observedAt,
      affectedPaths: finding.affectedPaths,
      affectedComponentsFromPacket: finding.affectedComponents,
      evidenceClaims: finding.evidenceClaims || [],
      runtimeQueries: finding.runtimeQueries || [],
      describeResults: finding.describeResults || [],
      matchedComponents: finding.matchedComponents,
      unmatchedAffectedPaths: finding.unmatchedAffectedPaths,
    })),
    importContract: {
      packetRoot: '.symposium/salesforce-insights/<run-id>/',
      requiredFiles: ['manifest.json', 'findings.json', 'evidence.md'],
      optionalFiles: ['transcript.md'],
      boundary: index.sourceSummary.safetyBoundary,
    },
  }, null, 2);
}

export function buildSalesforceStakeholderArtifactPlan(index: SalesforceMetadataIndex): string {
  const maxAtlasNodes = 500;
  const maxAtlasEdges = 2000;
  const maxAutomationComponents = 500;
  const maxAccessControlComponents = 500;
  const highPriorityRisks = index.risks.filter((item) => item.severity === 'critical' || item.severity === 'high');
  const highPriorityFindings = index.importedFindings.filter((item) => item.severity === 'critical' || item.severity === 'high');
  const dependencyCounts = buildDependencyCountsByComponent(index);
  const risksByComponent = groupRisksByComponent(index);
  const importedFindingCounts = buildImportedFindingCountsByComponent(index);
  const componentsByRisk = index.components
    .map((component) => ({
      id: component.id,
      name: component.name,
      type: component.type,
      path: component.path,
      dependencyCount: dependencyCounts.get(component.id) || 0,
      deterministicRiskCount: risksByComponent.get(component.id)?.length || 0,
      importedFindingCount: importedFindingCounts.get(component.id) || 0,
    }))
    .sort((a, b) =>
      (b.deterministicRiskCount + b.importedFindingCount + b.dependencyCount)
      - (a.deterministicRiskCount + a.importedFindingCount + a.dependencyCount)
    );

  const audienceCounts = index.importedFindings.reduce((acc, finding) => {
    acc[finding.audienceImpact] = (acc[finding.audienceImpact] || 0) + 1;
    return acc;
  }, {} as Partial<Record<SalesforceInsightAudienceImpact, number>>);
  const atlasComponents = componentsByRisk.slice(0, maxAtlasNodes);
  const atlasComponentIds = new Set(atlasComponents.map((component) => component.id));
  const atlasEdges = index.dependencies
    .filter((edge) => atlasComponentIds.has(edge.sourceId) || atlasComponentIds.has(edge.targetId))
    .slice(0, maxAtlasEdges);
  const automationComponents = index.components.filter((component) =>
    component.type === 'flow' || component.type === 'apex_trigger' || component.type === 'validation_rule'
  );
  const accessControlComponents = index.components.filter((component) =>
    component.type === 'permission_set' || component.type === 'profile'
  );

  return JSON.stringify({
    generatedAt: index.generatedAt,
    artifactLimits: {
      dependencyAtlasNodesIncluded: atlasComponents.length,
      dependencyAtlasNodesTotal: index.components.length,
      dependencyAtlasEdgesIncluded: atlasEdges.length,
      dependencyAtlasEdgesTotal: index.dependencies.length,
      automationComponentsIncluded: Math.min(automationComponents.length, maxAutomationComponents),
      automationComponentsTotal: automationComponents.length,
      accessControlComponentsIncluded: Math.min(accessControlComponents.length, maxAccessControlComponents),
      accessControlComponentsTotal: accessControlComponents.length,
      note: 'This artifact is intentionally capped for AI/tool usability. Use salesforce-dependency-map.json and salesforce-component-index.json for the full graph and inventory.',
    },
    visualArtifacts: {
      executiveImpactBrief: {
        purpose: 'Summarize Salesforce risk posture and decision points for executives.',
        headlineMetrics: {
          components: index.components.length,
          dependencies: index.dependencies.length,
          deterministicRisks: index.risks.length,
          importedFindings: index.importedFindings.length,
          highPriorityItems: highPriorityRisks.length + highPriorityFindings.length,
        },
        decisionPrompts: [
          'Which high-priority risks should be funded first?',
          'Which impacted business process needs executive sponsorship?',
          'Which changes require delivery sequencing or release governance?',
        ],
      },
      dependencyAtlas: {
        purpose: 'Interactive graph of metadata components, dependencies, and imported finding overlays.',
        nodes: atlasComponents.map((component) => ({
          id: component.id,
          label: component.name,
          type: component.type,
          riskWeight: component.deterministicRiskCount + component.importedFindingCount,
          dependencyCount: component.dependencyCount,
        })),
        edges: atlasEdges,
        overlays: index.importedFindings.map((finding) => ({
          id: `insight:${finding.packetRunId}:${finding.id}`,
          title: finding.title,
          severity: finding.severity,
          audienceImpact: finding.audienceImpact,
          matchedComponentIds: finding.matchedComponentIds,
        })),
      },
      changeImpactMap: {
        purpose: 'Show blast radius and likely validation surface for proposed Salesforce changes.',
        topHotspots: componentsByRisk.slice(0, 12),
      },
      processAutomationMap: {
        purpose: 'Translate flows, triggers, validation rules, and access-control metadata into PM-readable process surfaces.',
        automationComponents: automationComponents.slice(0, maxAutomationComponents),
        accessControlComponents: accessControlComponents.slice(0, maxAccessControlComponents),
      },
      engineeringRemediationRoadmap: {
        purpose: 'Convert deterministic audit risks and imported agent evidence into implementation sequencing.',
        backlogItemCount: index.risks.length + index.importedFindings.length,
        firstItems: [
          ...index.risks.slice(0, 6).map((riskItem) => ({
            id: riskItem.id,
            source: 'metadata_audit',
            title: riskItem.title,
            severity: riskItem.severity,
            target: riskItem.componentName,
            nextStep: riskItem.recommendation,
          })),
          ...index.importedFindings.slice(0, 6).map((finding) => ({
            id: `insight:${finding.packetRunId}:${finding.id}`,
            source: 'agent_insight_packet',
            title: finding.title,
            severity: finding.severity,
            target: finding.matchedComponentNames.join(', ') || finding.affectedComponents.join(', '),
            nextStep: finding.recommendedNextStep,
          })),
        ],
      },
    },
    audienceCounts,
    boundary: index.sourceSummary.safetyBoundary,
  }, null, 2);
}

export function buildSalesforceExecutiveBrief(index: SalesforceMetadataIndex, goal?: string): string {
  const criticalCount = index.risks.filter((item) => item.severity === 'critical').length
    + index.importedFindings.filter((item) => item.severity === 'critical').length;
  const highCount = index.risks.filter((item) => item.severity === 'high').length
    + index.importedFindings.filter((item) => item.severity === 'high').length;
  const topImportedFindings = index.importedFindings.slice(0, 5);

  return [
    '# Salesforce Executive Impact Brief',
    '',
    goal ? `Decision context: ${goal}` : 'Decision context: Salesforce metadata and imported agent evidence.',
    '',
    '## Portfolio Snapshot',
    '',
    `- Components indexed: ${index.components.length}`,
    `- Dependency links inferred: ${index.dependencies.length}`,
    `- Deterministic metadata risks: ${index.risks.length}`,
    `- Imported agent evidence: ${index.importedFindings.length}`,
    `- Critical/high-priority items: ${criticalCount} critical, ${highCount} high`,
    '',
    '## Executive Attention',
    '',
    ...(topImportedFindings.length > 0
      ? topImportedFindings.map((finding) =>
          `- **${finding.title}** (${finding.severity}) - ${finding.summary} Next step: ${finding.recommendedNextStep}`
        )
      : index.risks.slice(0, 5).map((riskItem) =>
          `- **${riskItem.title}** (${riskItem.severity}) - ${riskItem.detail} Next step: ${riskItem.recommendation}`
        )),
    '',
    '## Recommended Use',
    '',
    '- Use the dependency atlas to explain blast radius before funding or sequencing work.',
    '- Use the change impact map with product and engineering managers before implementation starts.',
    '- Use the engineering handoff only after stakeholders agree on priority and validation expectations.',
    '',
    '## Boundary',
    '',
    index.sourceSummary.safetyBoundary,
  ].join('\n');
}

function buildTestGuidance(item: SalesforceMetadataRisk): string[] {
  if (item.componentType === 'apex_class' || item.componentType === 'apex_trigger') {
    return ['Run targeted Apex tests for the affected class/trigger.', 'Add bulk test cases with 200 records for governor-limit-sensitive changes.'];
  }
  if (item.componentType === 'flow') {
    return ['Validate in Flow Builder with fault-path scenarios.', 'Run record-triggered flow tests or sandbox UAT for recursion/order-of-execution behavior.'];
  }
  if (item.componentType === 'permission_set' || item.componentType === 'profile') {
    return ['Review assigned users before changing access.', 'Validate least-privilege behavior with a non-admin test user.'];
  }
  return ['Run Salesforce DX source validation and targeted regression checks for referenced components.'];
}

export function formatComponentList(components: SalesforceMetadataComponent[]): string {
  if (components.length === 0) return 'No matching Salesforce metadata components found.';
  return components.map((component) => (
    `- ${component.name} (${component.type}) - ${component.path}; refs: ${component.references.map((reference) => reference.name).slice(0, 6).join(', ') || 'none'}`
  )).join('\n');
}

export function formatRiskList(risks: SalesforceMetadataRisk[]): string {
  if (risks.length === 0) return 'No Salesforce metadata static signals were detected by the current rules.';
  return risks.slice(0, 50).map((item) => [
    `- [${item.severity.toUpperCase()}] ${item.title} - ${item.componentName}`,
    `  Path: ${item.path}`,
    `  Evidence grade: rule ${item.ruleId}, confidence ${item.confidence.toFixed(2)}, docs topics ${item.docTopicIds.join(', ') || 'none'}`,
    `  Recommendation: ${item.recommendation}`,
  ].join('\n')).join('\n');
}
