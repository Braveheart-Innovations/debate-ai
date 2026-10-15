/**
 * Moved from symposium-ai-web src/services/analyze/orchestrator/tools/executeSalesforceMetadataAuditTool.ts
 * (Phase 3 Step 5); the sandbox filesystem is injected. One fix since: every
 * artifact is also written at /output/<filename> (see buildFilesystemEntry).
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import type { SalesforceMetadataAuditArgs, SalesforceMetadataAuditOperation } from '../../contract/lib/ai/tools/built-in/salesforce-metadata-audit';
import { SALESFORCE_ANALYSIS_LENSES } from '../../contract/config/analysis-lenses';
import type { SandboxFiles } from './sandboxFiles';
import { diagramFileText } from '../../contract/services/analyze/diagrams/diagramFile';
import { buildSalesforceDataModel } from '../../salesforce/salesforceDataModel';
import { buildSalesforceFlowDiagrams } from '../../salesforce/salesforceFlowDiagram';
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
  formatComponentList,
  formatRiskList,
  loadSalesforceWorkspaceInputs,
  searchSalesforceMetadata,
  summarizeSalesforceIndex,
  type SalesforceInvalidInsightPacket,
  type SalesforceMetadataIndex,
  type SalesforceSourceFile,
} from '../../salesforce/SalesforceMetadataService';

const DEFAULT_OPERATION: SalesforceMetadataAuditOperation = 'audit';
const SALESFORCE_OUTPUT_ROOT = '/output/salesforce';
const SALESFORCE_DATA_ROOT = '/data/salesforce';
/** The uploaded workspace, unpacked for Python (same paths as in the upload). */
export const SALESFORCE_WORKSPACE_ROOT = `${SALESFORCE_DATA_ROOT}/workspace`;

interface SalesforceArtifactFile {
  filename: string;
  content: string;
}

interface SalesforceArtifactFilesystemEntry {
  filename: string;
  outputPath: string;
  dataPath: string;
  aliases: string[];
}

export async function executeSalesforceMetadataAuditTool(
  files: SandboxFiles,
  toolCallId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const parsedArgs = normalizeArgs(args);
    const { sourceFiles, insightPackets, invalidInsightPackets, retrieveRun } = await loadSalesforceWorkspaceInputs(files, parsedArgs.paths);

    if (sourceFiles.length === 0) {
      return {
        toolCallId,
        success: false,
        error: 'No Salesforce metadata source files were found. Upload a Salesforce DX project ZIP, metadata ZIP, or source files such as .cls, .trigger, *-meta.xml, package.xml, or sfdx-project.json. Optional agent insight packets can be included under .symposium/salesforce-insights/<run-id>/ alongside the source.',
      };
    }

    const workspaceNote = await unpackWorkspace(files, sourceFiles);

    if (parsedArgs.operation === 'data_model') {
      return await writeSalesforceDataModel(files, toolCallId, sourceFiles, parsedArgs);
    }
    if (parsedArgs.operation === 'flow_diagram') {
      return await writeSalesforceFlowDiagrams(files, toolCallId, sourceFiles, parsedArgs);
    }

    const index = buildSalesforceMetadataIndex(sourceFiles, parsedArgs.paths || [], insightPackets, parsedArgs.query, retrieveRun);
    const artifactFiles = parsedArgs.include_artifacts === false
      ? []
      : buildArtifactFiles(index, parsedArgs, invalidInsightPackets);
    const filesystemArtifacts = artifactFiles.length > 0
      ? await persistArtifactFilesToFilesystem(files, artifactFiles)
      : [];
    const content = `${buildOperationContent(index, parsedArgs, filesystemArtifacts, invalidInsightPackets)}\n\n${workspaceNote}`;
    const dataOutputs = artifactFiles.length > 0
      ? encodeArtifactOutputs(artifactFiles)
      : undefined;

    return {
      toolCallId,
      success: true,
      content,
      dataOutputs,
      metadata: {
        fullStdout: JSON.stringify({
          operation: parsedArgs.operation,
          sourceSummary: index.sourceSummary,
          componentPreview: index.components.slice(0, 100),
          dependencyCount: index.dependencies.length,
          riskPreview: index.risks.slice(0, 100),
          evidenceLedgerPreview: index.evidenceLedger.slice(0, 100),
          flowDrilldownPreview: index.flowDrilldowns.slice(0, 25),
          apexDrilldownPreview: index.apexDrilldowns.slice(0, 25),
          featureReferenceMap: index.featureReferenceMap,
          insightPackets: index.insightPackets,
          importedFindingPreview: index.importedFindings.slice(0, 100),
          invalidInsightPackets,
          filesystemArtifacts,
        }, null, 2),
      },
    };
  } catch (error) {
    return {
      toolCallId,
      success: false,
      error: error instanceof Error ? error.message : 'Salesforce metadata audit failed',
    };
  }
}

/**
 * Unpack the workspace bundles into SALESFORCE_WORKSPACE_ROOT so the operator and
 * teammates can work over every file in Python. Returns the line that tells the model.
 */
async function unpackWorkspace(files: SandboxFiles, sourceFiles: SalesforceSourceFile[]): Promise<string> {
  const bundles = Array.from(new Set(sourceFiles
    .map((file) => file.sourcePath)
    .filter((path): path is string => typeof path === 'string' && /\.zip$/i.test(path))));
  if (bundles.length === 0) {
    return 'Read the uploaded Salesforce files with salesforce_read_source.';
  }
  try {
    await files.extractZips(bundles, SALESFORCE_WORKSPACE_ROOT);
    return `The workspace's files are unpacked at ${SALESFORCE_WORKSPACE_ROOT}/ (the upload's paths). Use Python over them for questions the audit's files don't answer, such as every automation that writes a field or every place a label appears; quote code with salesforce_read_source and cite path:line.`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return `The workspace could not be unpacked at ${SALESFORCE_WORKSPACE_ROOT}/ (${reason}); read files with salesforce_read_source.`;
  }
}

function normalizeArgs(args: Record<string, unknown>): SalesforceMetadataAuditArgs & { operation: SalesforceMetadataAuditOperation } {
  const operation = typeof args.operation === 'string' && isOperation(args.operation)
    ? args.operation
    : DEFAULT_OPERATION;
  const paths = Array.isArray(args.paths)
    ? args.paths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
    : undefined;

  return {
    operation,
    paths,
    query: typeof args.query === 'string' ? args.query : undefined,
    component: typeof args.component === 'string' ? args.component : undefined,
    include_artifacts: typeof args.include_artifacts === 'boolean' ? args.include_artifacts : true,
    objects: Array.isArray(args.objects)
      ? args.objects.filter((object): object is string => typeof object === 'string' && object.trim().length > 0)
      : undefined,
    name: typeof args.name === 'string' ? args.name : undefined,
    flows: Array.isArray(args.flows)
      ? args.flows.filter((flow): flow is string => typeof flow === 'string' && flow.trim().length > 0)
      : undefined,
    chain: typeof args.chain === 'boolean' ? args.chain : undefined,
  };
}

function isOperation(value: string): value is SalesforceMetadataAuditOperation {
  return ['audit', 'inventory', 'search', 'component', 'dependencies', 'risks', 'packet_findings', 'handoff', 'feature_readiness', 'troubleshooting', 'data_model', 'flow_diagram'].includes(value);
}

/**
 * The org-evidence decision instruction lives HERE, in the tool result at the
 * exact moment the model reads its evidence — not only in the system prompt.
 * Two live runs finalized reports containing an "org runtime evidence: none
 * was supplied" caveat without ever raising the request card: with
 * reasoning_effort forced to 'none' for GPT-5.6 tool turns, a conditional
 * rule buried in a large system prompt loses; a state-conditioned imperative
 * adjacent to the evidence does not.
 */
function buildOrgEvidenceNote(index: SalesforceMetadataIndex): string {
  if (index.importedFindings.length > 0) {
    return 'Org evidence note: imported agent findings are present — verify runtime claims against their raw SOQL/describe evidence before finalizing.';
  }
  return 'ORG EVIDENCE DECISION (read now): NO org-runtime evidence packet is present, so active flow versions, permission/queue assignments, OAuth scopes, and org settings are ALL unverifiable from this audit. If any conclusion in your report depends on such runtime state, you MUST call request_salesforce_org_evidence BEFORE writing the report — author its investigation_prompt as a real brief for the org-connected agent (each specific question, why it matters, what answer would change your recommendation). Do NOT finalize with an "org runtime evidence: none was supplied" style caveat unless the user has already declined the request.';
}

/**
 * In Auto mode no lens is pinned, so the model's OPERATION choice is the lens
 * choice — but until now that choice carried none of the lens's synthesis
 * framing or report-type hint (only pinned lenses injected those via the
 * system prompt). Close the asymmetry at the moment the choice becomes real:
 * the tool result names the path taken, its synthesis focus, and the report
 * type that usually fits it. Deferential when the user pinned things — the
 * OUTPUT section's pinned report type always wins.
 */
function buildLensSynthesisNote(
  operation: SalesforceMetadataAuditOperation,
  query?: string,
): string {
  const candidates = SALESFORCE_ANALYSIS_LENSES.filter(
    (lens) => lens.recommendedOperation === operation && lens.selectable !== false,
  );
  if (candidates.length === 0) return '';
  // feature_readiness serves two lenses; a release/go-live flavored query
  // selects the Release Readiness framing.
  const lens = candidates.length > 1 && query && /release|go-live|seasonal/i.test(query)
    ? candidates.find((candidate) => candidate.id === 'salesforce_release_readiness') ?? candidates[0]
    : candidates[0];

  return `Synthesis guidance (${lens.name} path): ${lens.description} If the user did not pin a report type, \`${lens.defaultReportTypeId}\` is usually the best fit for this path — set the spec's reportTypeId accordingly; a user-pinned type in the OUTPUT section always wins.`;
}

function buildOperationContent(
  index: SalesforceMetadataIndex,
  args: SalesforceMetadataAuditArgs & { operation: SalesforceMetadataAuditOperation },
  filesystemArtifacts: SalesforceArtifactFilesystemEntry[] = [],
  invalidInsightPackets: SalesforceInvalidInsightPacket[] = [],
): string {
  const filesystemSection = formatFilesystemArtifactSection(filesystemArtifacts);
  const synthesisNote = buildLensSynthesisNote(args.operation, args.query);
  switch (args.operation) {
    case 'inventory':
      return [
        summarizeSalesforceIndex(index),
        '',
        'Component inventory preview:',
        formatComponentList(index.components.slice(0, 40)),
      ].join('\n');

    case 'search':
      return [
        summarizeSalesforceIndex(index),
        '',
        `Search results for "${args.query || ''}":`,
        formatComponentList(searchSalesforceMetadata(index, args.query || '')),
      ].join('\n');

    case 'component': {
      const component = args.component ? findSalesforceComponent(index, args.component) : null;
      if (!component) {
        return `Component not found. Use operation="search" first.\n\n${summarizeSalesforceIndex(index)}`;
      }
      const dependencies = index.dependencies.filter((dependency) =>
        dependency.sourceId === component.id || dependency.targetId === component.id
      );
      const risks = index.risks.filter((risk) => risk.componentId === component.id);
      return [
        `Component: ${component.name} (${component.metadataType ?? component.type})`,
        ...(component.managed
          ? [`Owner: installed package${component.namespace ? ` ${component.namespace}` : ''}${component.sourceHidden ? ' (source hidden)' : ''}; no risk rules run on it`]
          : []),
        `Path: ${component.path}`,
        `Files: ${component.paths.join(', ')}`,
        `Tags: ${component.tags.join(', ') || 'none'}`,
        `References: ${component.references.map((reference) => `${reference.name} (${reference.kind})`).join(', ') || 'none'}`,
        '',
        `Dependency links: ${dependencies.length}`,
        ...dependencies.slice(0, 20).map((dependency) => `- ${dependency.sourceName} -> ${dependency.targetName} (${dependency.reference})`),
        '',
        `Risk findings: ${risks.length}`,
        formatRiskList(risks),
      ].join('\n');
    }

    case 'dependencies': {
      const component = args.component ? findSalesforceComponent(index, args.component) : null;
      const dependencies = component
        ? index.dependencies.filter((dependency) => dependency.sourceId === component.id || dependency.targetId === component.id)
        : index.dependencies;
      return [
        summarizeSalesforceIndex(index),
        '',
        component ? `Dependency links for ${component.name}:` : 'Dependency map preview:',
        dependencies.length === 0
          ? 'No dependency links inferred from the indexed metadata.'
          : dependencies.slice(0, 80).map((dependency) => `- ${dependency.sourceName} -> ${dependency.targetName} (${dependency.reference})`).join('\n'),
        '',
        synthesisNote,
      ].join('\n');
    }

    case 'risks':
      return [
        summarizeSalesforceIndex(index),
        '',
        'Static signals requiring docs/AI review:',
        formatRiskList(index.risks),
        '',
        synthesisNote,
      ].join('\n');

    case 'packet_findings':
      return [
        summarizeSalesforceIndex(index),
        '',
        `Agent insight packets detected: ${index.insightPackets.length}`,
        `Imported agent evidence from .symposium packets: ${index.importedFindings.length}`,
        `Invalid insight packets / validation warnings: ${invalidInsightPackets.length}`,
        'Imported agent evidence entries are available at the top-level `importedFindings` key in `salesforce-insight-packets.json`; packet metadata is in `validPackets` and rejected packets are in `invalidPackets`.',
        '',
        index.importedFindings.length === 0
          ? 'No valid imported agent evidence was found. Check `invalidPackets[]` in `salesforce-insight-packets.json` for validation warnings/errors.'
          : index.importedFindings.slice(0, 20).map((finding) => [
            `- ${finding.id}: ${finding.title} (${finding.severity}, ${finding.audienceImpact}, confidence ${finding.confidence})`,
            `  Matched components: ${finding.matchedComponents.map((component) => component.name).join(', ') || 'none'}`,
            `  Affected paths: ${finding.affectedPaths.join(', ') || 'none'}`,
            `  Next step: ${finding.recommendedNextStep}`,
          ].join('\n')).join('\n'),
        filesystemSection,
      ].join('\n');

    case 'handoff':
      return [
        summarizeSalesforceIndex(index),
        '',
        'Engineering handoff package generated as an artifact. It includes target components, imported agent evidence when present, desired changes, acceptance criteria, test guidance, and local agent prompts.',
        '',
        synthesisNote,
        filesystemSection,
      ].join('\n');

    case 'feature_readiness':
      return [
        buildSalesforceFeatureReadinessBrief(index, args.query),
        synthesisNote,
        buildOrgEvidenceNote(index),
        filesystemSection,
      ].filter(Boolean).join('\n\n');

    case 'troubleshooting':
      return [
        buildSalesforceTroubleshootingBrief(index, args.query),
        synthesisNote,
        buildOrgEvidenceNote(index),
        filesystemSection,
      ].filter(Boolean).join('\n\n');

    case 'audit':
    default:
      return [
        summarizeSalesforceIndex(index),
        '',
        `Static metadata signals requiring docs/AI review: ${index.risks.length}`,
        `Salesforce documentation lookup topics generated: ${index.documentationTopics.length}`,
        `Imported agent evidence from .symposium packets: ${index.importedFindings.length}`,
        `Invalid insight packets / validation warnings: ${invalidInsightPackets.length}`,
        'Imported agent evidence entries are available at the top-level `importedFindings` key in `salesforce-insight-packets.json`; packet metadata is in `validPackets`.',
        '',
        'Generated artifacts:',
        '- Salesforce component index JSON',
        '- Salesforce dependency map JSON',
        '- Salesforce metadata audit report Markdown',
        '- Salesforce remediation backlog JSON',
        '- Salesforce signal evidence JSON',
        '- Salesforce evidence ledger JSON',
        '- Salesforce Flow drilldowns JSON',
        '- Salesforce Apex drilldowns JSON',
        '- Salesforce feature reference map JSON',
        '- Salesforce workbench summary JSON',
        '- Salesforce documentation lookup topics JSON',
        '- Salesforce feature-readiness brief Markdown',
        '- Salesforce executive brief Markdown',
        '- Salesforce insight packet summary JSON',
        '- Salesforce stakeholder visual artifact plan JSON',
        '- Salesforce engineering handoff JSON',
        '- Salesforce artifact schema JSON',
        '',
        synthesisNote,
        buildOrgEvidenceNote(index),
        'Evidence grounding note: use salesforce-evidence-ledger.json to distinguish metadata, SOQL, describe, docs, imported agent summary, inference, and runtime-unverified claims. Do not state org runtime/setup facts unless backed by SOQL/describe evidence.',
        'Documentation grounding note: for audit, risks, troubleshooting, feature_readiness, or handoff synthesis, call salesforce_docs_lookup with topics from salesforce-doc-topics.json before final findings. If docs lookup fails or only preview/beta/pilot docs are available, downgrade confidence and state the limitation.',
        'Deliverable note: these generated files are evidence/source material for the final response. Continue to the selected output format after this tool call. If the user requested HTML or a static page, synthesize one HTML artifact from these files and do not substitute JSON schema output. Do not write extra intermediate diagnostics under /output unless the user explicitly requested those files.',
        filesystemSection,
      ].join('\n');
  }
}

function formatFilesystemArtifactSection(filesystemArtifacts: SalesforceArtifactFilesystemEntry[]): string {
  if (filesystemArtifacts.length === 0) return '';
  const manifest = filesystemArtifacts.find((entry) => entry.filename === 'artifact-manifest.json');
  const keyArtifacts = [
    'artifact-manifest.json',
    'salesforce-component-index.json',
    'salesforce-dependency-map.json',
    'salesforce-insight-packets.json',
    'salesforce-workbench-summary.json',
    'salesforce-signal-evidence.json',
    'salesforce-evidence-ledger.json',
    'salesforce-flow-drilldowns.json',
    'salesforce-apex-drilldowns.json',
    'salesforce-feature-reference-map.json',
    'salesforce-doc-topics.json',
    'salesforce-artifact-schema.json',
    'salesforce-stakeholder-visual-artifacts.json',
    'salesforce-executive-brief.md',
    'salesforce-troubleshooting-brief.md',
    'salesforce-vscode-handoff.json',
  ];
  const byFilename = new Map(filesystemArtifacts.map((entry) => [entry.filename, entry]));
  return [
    '',
    'Filesystem artifact paths for follow-up Python analysis:',
    manifest ? `- Manifest: \`${manifest.outputPath}\` (also \`${manifest.dataPath}\`)` : '',
    ...keyArtifacts
      .filter((filename) => filename !== 'artifact-manifest.json')
      .map((filename) => byFilename.get(filename))
      .filter((entry): entry is SalesforceArtifactFilesystemEntry => !!entry)
      .map((entry) => `- \`${entry.outputPath}\` (also \`${entry.dataPath}\`)`),
  ].filter(Boolean).join('\n');
}

function buildArtifactFiles(
  index: SalesforceMetadataIndex,
  args: SalesforceMetadataAuditArgs & { operation: SalesforceMetadataAuditOperation },
  invalidInsightPackets: SalesforceInvalidInsightPacket[],
): SalesforceArtifactFile[] {
  const outputs: SalesforceArtifactFile[] = [];

  const addCoreAuditOutputs = () => {
    outputs.push(
      { filename: 'salesforce-component-index.json', content: buildSalesforceInventory(index) },
      { filename: 'salesforce-dependency-map.json', content: buildSalesforceDependencyMap(index) },
      { filename: 'salesforce-metadata-audit-report.md', content: buildSalesforceAuditReport(index) },
      { filename: 'salesforce-remediation-backlog.json', content: buildSalesforceRemediationBacklog(index) },
      { filename: 'salesforce-signal-evidence.json', content: buildSalesforceSignalEvidence(index) },
      { filename: 'salesforce-evidence-ledger.json', content: buildSalesforceEvidenceLedger(index) },
      { filename: 'salesforce-flow-drilldowns.json', content: buildSalesforceFlowDrilldowns(index) },
      { filename: 'salesforce-apex-drilldowns.json', content: buildSalesforceApexDrilldowns(index) },
      { filename: 'salesforce-feature-reference-map.json', content: buildSalesforceFeatureReferenceMap(index) },
      { filename: 'salesforce-workbench-summary.json', content: buildSalesforceWorkbenchSummary(index) },
      { filename: 'salesforce-insight-packets.json', content: buildSalesforceInsightPacketSummary(index, invalidInsightPackets) },
      { filename: 'salesforce-doc-topics.json', content: buildSalesforceDocumentationTopics(index, args.query) },
      { filename: 'salesforce-artifact-schema.json', content: buildSalesforceArtifactSchema(index) },
      { filename: 'salesforce-stakeholder-visual-artifacts.json', content: buildSalesforceStakeholderArtifactPlan(index) },
    );
  };

  if (args.operation === 'audit') {
    addCoreAuditOutputs();
    outputs.push(
      { filename: 'salesforce-feature-readiness-brief.md', content: buildSalesforceFeatureReadinessBrief(index, args.query) },
      { filename: 'salesforce-executive-brief.md', content: buildSalesforceExecutiveBrief(index, args.query) },
      { filename: 'salesforce-vscode-handoff.json', content: JSON.stringify(buildSalesforceVsCodeHandoff(index, args.query)) },
    );
  } else if (args.operation === 'inventory' || args.operation === 'search' || args.operation === 'component') {
    outputs.push({ filename: 'salesforce-component-index.json', content: buildSalesforceInventory(index) });
  } else if (args.operation === 'dependencies') {
    outputs.push({ filename: 'salesforce-dependency-map.json', content: buildSalesforceDependencyMap(index) });
  } else if (args.operation === 'risks') {
    outputs.push(
      { filename: 'salesforce-metadata-audit-report.md', content: buildSalesforceAuditReport(index) },
      { filename: 'salesforce-remediation-backlog.json', content: buildSalesforceRemediationBacklog(index) },
      { filename: 'salesforce-signal-evidence.json', content: buildSalesforceSignalEvidence(index) },
      { filename: 'salesforce-evidence-ledger.json', content: buildSalesforceEvidenceLedger(index) },
      { filename: 'salesforce-flow-drilldowns.json', content: buildSalesforceFlowDrilldowns(index) },
      { filename: 'salesforce-apex-drilldowns.json', content: buildSalesforceApexDrilldowns(index) },
      { filename: 'salesforce-feature-reference-map.json', content: buildSalesforceFeatureReferenceMap(index) },
      { filename: 'salesforce-workbench-summary.json', content: buildSalesforceWorkbenchSummary(index) },
      { filename: 'salesforce-insight-packets.json', content: buildSalesforceInsightPacketSummary(index, invalidInsightPackets) },
      { filename: 'salesforce-doc-topics.json', content: buildSalesforceDocumentationTopics(index, args.query) },
    );
  } else if (args.operation === 'packet_findings') {
    outputs.push(
      { filename: 'salesforce-insight-packets.json', content: buildSalesforceInsightPacketSummary(index, invalidInsightPackets) },
      { filename: 'salesforce-evidence-ledger.json', content: buildSalesforceEvidenceLedger(index) },
      { filename: 'salesforce-feature-reference-map.json', content: buildSalesforceFeatureReferenceMap(index) },
      { filename: 'salesforce-doc-topics.json', content: buildSalesforceDocumentationTopics(index, args.query) },
      { filename: 'salesforce-artifact-schema.json', content: buildSalesforceArtifactSchema(index) },
    );
  } else if (args.operation === 'handoff') {
    outputs.push(
      { filename: 'salesforce-vscode-handoff.json', content: JSON.stringify(buildSalesforceVsCodeHandoff(index, args.query)) },
      { filename: 'salesforce-evidence-ledger.json', content: buildSalesforceEvidenceLedger(index) },
      { filename: 'salesforce-feature-reference-map.json', content: buildSalesforceFeatureReferenceMap(index) },
      { filename: 'salesforce-doc-topics.json', content: buildSalesforceDocumentationTopics(index, args.query) },
    );
  } else if (args.operation === 'feature_readiness') {
    outputs.push(
      { filename: 'salesforce-feature-readiness-brief.md', content: buildSalesforceFeatureReadinessBrief(index, args.query) },
      { filename: 'salesforce-executive-brief.md', content: buildSalesforceExecutiveBrief(index, args.query) },
      { filename: 'salesforce-evidence-ledger.json', content: buildSalesforceEvidenceLedger(index) },
      { filename: 'salesforce-flow-drilldowns.json', content: buildSalesforceFlowDrilldowns(index) },
      { filename: 'salesforce-apex-drilldowns.json', content: buildSalesforceApexDrilldowns(index) },
      { filename: 'salesforce-feature-reference-map.json', content: buildSalesforceFeatureReferenceMap(index) },
      { filename: 'salesforce-stakeholder-visual-artifacts.json', content: buildSalesforceStakeholderArtifactPlan(index) },
      { filename: 'salesforce-doc-topics.json', content: buildSalesforceDocumentationTopics(index, args.query) },
    );
  } else if (args.operation === 'troubleshooting') {
    outputs.push(
      { filename: 'salesforce-troubleshooting-brief.md', content: buildSalesforceTroubleshootingBrief(index, args.query) },
      { filename: 'salesforce-component-index.json', content: buildSalesforceInventory(index) },
      { filename: 'salesforce-dependency-map.json', content: buildSalesforceDependencyMap(index) },
      { filename: 'salesforce-remediation-backlog.json', content: buildSalesforceRemediationBacklog(index) },
      { filename: 'salesforce-signal-evidence.json', content: buildSalesforceSignalEvidence(index) },
      { filename: 'salesforce-evidence-ledger.json', content: buildSalesforceEvidenceLedger(index) },
      { filename: 'salesforce-flow-drilldowns.json', content: buildSalesforceFlowDrilldowns(index) },
      { filename: 'salesforce-apex-drilldowns.json', content: buildSalesforceApexDrilldowns(index) },
      { filename: 'salesforce-feature-reference-map.json', content: buildSalesforceFeatureReferenceMap(index) },
      { filename: 'salesforce-workbench-summary.json', content: buildSalesforceWorkbenchSummary(index) },
      { filename: 'salesforce-insight-packets.json', content: buildSalesforceInsightPacketSummary(index, invalidInsightPackets) },
      { filename: 'salesforce-doc-topics.json', content: buildSalesforceDocumentationTopics(index, args.query) },
      { filename: 'salesforce-artifact-schema.json', content: buildSalesforceArtifactSchema(index) },
    );
  }

  const manifest = buildArtifactFilesystemManifest(outputs);
  return [
    ...outputs,
    {
      filename: 'artifact-manifest.json',
      content: JSON.stringify(manifest),
    },
  ];
}

function buildArtifactFilesystemManifest(files: SalesforceArtifactFile[]): {
  version: 1;
  generatedAt: string;
  outputRoot: string;
  dataRoot: string;
  files: SalesforceArtifactFilesystemEntry[];
} {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    outputRoot: SALESFORCE_OUTPUT_ROOT,
    dataRoot: SALESFORCE_DATA_ROOT,
    files: files.map((file) => buildFilesystemEntry(file.filename)),
  };
}

function buildFilesystemEntry(filename: string): SalesforceArtifactFilesystemEntry {
  return {
    filename,
    outputPath: `${SALESFORCE_OUTPUT_ROOT}/${filename}`,
    dataPath: `${SALESFORCE_DATA_ROOT}/${filename}`,
    // The tool history lists each data output as /output/<filename>
    // (toolResultHistory), so the file must exist there too; a model that read
    // the listed path got "file not found" (live smoke 2026-10-09).
    aliases: [`/output/${filename}`, ...getFilesystemAliases(filename)],
  };
}

function getFilesystemAliases(filename: string): string[] {
  const aliases: Record<string, string[]> = {
    'artifact-manifest.json': ['/data/salesforce_artifact_manifest.json'],
    'salesforce-component-index.json': ['/data/salesforce_component_index.json'],
    'salesforce-dependency-map.json': ['/data/salesforce_dependency_map.json'],
    'salesforce-insight-packets.json': ['/data/salesforce_insight_packet_summary.json'],
    'salesforce-workbench-summary.json': ['/data/salesforce_workbench_summary.json'],
    'salesforce-signal-evidence.json': ['/data/salesforce_signal_evidence.json'],
    'salesforce-evidence-ledger.json': ['/data/salesforce_evidence_ledger.json'],
    'salesforce-flow-drilldowns.json': ['/data/salesforce_flow_drilldowns.json'],
    'salesforce-apex-drilldowns.json': ['/data/salesforce_apex_drilldowns.json'],
    'salesforce-feature-reference-map.json': ['/data/salesforce_feature_reference_map.json'],
    'salesforce-doc-topics.json': ['/data/salesforce_doc_topics.json'],
    'salesforce-artifact-schema.json': ['/data/salesforce_artifact_schema.json'],
    'salesforce-stakeholder-visual-artifacts.json': ['/data/salesforce_stakeholder_visual_artifacts.json'],
    'salesforce-vscode-handoff.json': ['/data/salesforce_vscode_handoff.json'],
    'salesforce-remediation-backlog.json': ['/data/salesforce_remediation_backlog.json'],
    'salesforce-troubleshooting-brief.md': ['/data/salesforce_troubleshooting_brief.md'],
  };
  return aliases[filename] || [];
}

function buildSalesforceArtifactSchema(index: SalesforceMetadataIndex): string {
  return JSON.stringify({
    version: 1,
    generatedAt: index.generatedAt,
    purpose: 'Machine-readable guide for Salesforce audit artifacts generated by salesforce_metadata_audit.',
    artifacts: {
      'salesforce-component-index.json': {
        purpose: 'Component inventory, dependency/risk counts, and imported finding overlays by component.',
        keyPaths: ['components[]', 'dependencies[]', 'risks[]', 'importedFindings[]'],
      },
      'salesforce-dependency-map.json': {
        purpose: 'Graph-ready metadata dependency model.',
        keyPaths: ['nodes[]', 'edges[]', 'importedFindingEdges[]'],
      },
      'salesforce-insight-packets.json': {
        purpose: 'Agent insight packet import status and finding/component joins.',
        keyPaths: [
          'validPackets[]',
          'invalidPackets[]',
          'importedFindings[]',
          'importedFindings[].matchedComponents[]',
          'componentMappings[]',
        ],
        note: 'The actual imported agent evidence entries are at top-level importedFindings[]. validPackets[] contains packet metadata and findingCount only.',
      },
      'salesforce-remediation-backlog.json': {
        purpose: 'Prioritized remediation backlog from static metadata signals plus imported agent evidence.',
        keyPaths: ['items[]', 'items[].signalId', 'items[].componentType', 'items[].evidenceSpans[]', 'items[].evidenceDetails[]'],
      },
      'salesforce-signal-evidence.json': {
        purpose: 'Drilldown evidence for static Salesforce signals, including source spans and Flow/Apex element-level details.',
        keyPaths: ['summary', 'byRuleId[]', 'signals[]', 'signals[].evidenceSpans[]', 'signals[].evidenceDetails[]'],
      },
      'salesforce-evidence-ledger.json': {
        purpose: 'Claim-level provenance ledger separating metadata, SOQL, describe, docs, imported summary, inference, and runtime-unverified claims.',
        keyPaths: ['summary.bySourceType', 'sourceTypePolicy', 'claims[]', 'claims[].sourceType', 'claims[].limitations[]'],
      },
      'salesforce-flow-drilldowns.json': {
        purpose: 'Compact Flow internals for exact element names, mutation elements, fault connector status, subflow references, and related static risks.',
        keyPaths: ['summary', 'drilldowns[]', 'drilldowns[].elements[]', 'drilldowns[].mutatingElementsWithoutFaults[]'],
      },
      'salesforce-apex-drilldowns.json': {
        purpose: 'Compact Apex internals for method spans, source-level signal details, sharing mode, and email/platform references.',
        keyPaths: ['summary', 'drilldowns[]', 'drilldowns[].methodSpans[]', 'drilldowns[].emailReferences[]'],
      },
      'salesforce-feature-reference-map.json': {
        purpose: 'Question-aware map of Salesforce objects, fields, features, integrations, and related metadata/imported findings.',
        keyPaths: ['features[]', 'features[].docTopicIds[]', 'features[].matchedComponents[]', 'features[].runtimeVerificationRequired'],
      },
      'salesforce-workbench-summary.json': {
        purpose: 'Compact AI-friendly summary of the audit workbench state, top signals, top components, docs verification status, and artifact map.',
        keyPaths: ['sourceSummary', 'topSignalsByRule[]', 'topComponents[]', 'docsVerification', 'artifactMap'],
      },
      'salesforce-doc-topics.json': {
        purpose: 'Structured topics and recommended arguments for salesforce_docs_lookup grounding against current official Salesforce documentation.',
        keyPaths: ['topics[]', 'lookupArgs', 'componentTypes[]', 'apiVersions[]', 'riskSignalIds[]'],
      },
      'salesforce-stakeholder-visual-artifacts.json': {
        purpose: 'Visualization-ready specifications for executive, PM, and engineering views.',
        keyPaths: ['visualArtifacts.executiveImpactBrief', 'visualArtifacts.dependencyAtlas', 'visualArtifacts.changeImpactMap', 'visualArtifacts.engineeringRemediationRoadmap'],
      },
      'salesforce-executive-brief.md': {
        purpose: 'Executive-readable Markdown brief.',
      },
      'salesforce-troubleshooting-brief.md': {
        purpose: 'Read-only diagnosis brief for pasted Flow errors, Apex exceptions, validation failures, and production bug reports.',
        keyPaths: ['reported issue', 'likely metadata starting points', 'related static risk signals', 'read-only diagnostic path'],
      },
      'salesforce-vscode-handoff.json': {
        purpose: 'Read-only implementation handoff prompts and acceptance criteria for local coding agents.',
        keyPaths: ['targetComponents[]', 'remediationTasks[]', 'vscodePrompts'],
      },
    },
    countSemantics: {
      deterministicMetadataRisks: 'Static metadata signals auto-detected by Symposium and reported in index.risks / remediation backlog. Treat as evidence to verify against docs and org context, not final findings.',
      importedAgentFindings: 'Imported from .symposium/salesforce-insights packets and reported in salesforce-insight-packets.json importedFindings[]. sourceType=agent_summary means the finding is a lead requiring verification, not a final org fact.',
      documentationEvidence: 'Generated by salesforce_docs_lookup from official Salesforce domains and reported in salesforce-doc-evidence.json.',
    },
    outputGuidance: {
      richArtifacts: 'Follow the selected output config. If the user requested HTML or a static page, produce HTML from these packet files; do not substitute JSON schema output for the requested deliverable.',
      avoidStdoutExploration: 'For large JSON, inspect keys and write derived files instead of printing entire documents to stdout.',
    },
  }, null, 2);
}

async function persistArtifactFilesToFilesystem(sandbox: SandboxFiles, files: SalesforceArtifactFile[]): Promise<SalesforceArtifactFilesystemEntry[]> {
  const entries = files.map((file) => buildFilesystemEntry(file.filename));

  // Each file is written once; its other paths are links to it inside the sandbox.
  // Writing every path from here held several copies of each output in memory and
  // ran a real-size workspace out of memory (Step 8 re-run R3).
  for (const [i, file] of files.entries()) {
    const entry = entries[i];
    await sandbox.writeFile(entry.outputPath, Buffer.from(file.content, 'utf8'));
  }
  await sandbox.linkFiles(entries.map((entry) => ({ target: entry.outputPath, links: [entry.dataPath, ...entry.aliases] })));

  return entries;
}

function encodeArtifactOutputs(outputs: SalesforceArtifactFile[]): NonNullable<ToolResult['dataOutputs']> {
  return outputs.map((output) => ({
    filename: output.filename,
    base64: Buffer.from(output.content, 'utf8').toString('base64'),
    size: Buffer.byteLength(output.content, 'utf8'),
  }));
}

/** A diagram file's name: a short snake_case name, without `.diagram.json`. */
export function dataModelFileName(name: string | undefined, fallback = 'salesforce_data_model'): string {
  const cleaned = (name ?? '')
    .replace(/^\/?output\//, '')
    .replace(/\.diagram\.json$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

/**
 * operation=data_model: the workspace's objects, fields and relationships as a
 * diagram file (/output/<name>.diagram.json), written into the sandbox for the
 * agent to change and returned for capture, which makes it a diagram.
 */
async function writeSalesforceDataModel(
  files: SandboxFiles,
  toolCallId: string,
  sourceFiles: SalesforceSourceFile[],
  args: SalesforceMetadataAuditArgs,
): Promise<ToolResult> {
  const uploads = [...new Set(sourceFiles.map((file) => (file.sourcePath ?? '').split('/').pop()).filter(Boolean))];
  const { diagram, notFound, referenced, packageObjects, packageFieldCount } = buildSalesforceDataModel(sourceFiles, {
    objects: args.objects,
    uploadName: uploads.length === 1 ? uploads[0] : undefined,
  });
  if (diagram.entities.length === 0) {
    return {
      toolCallId,
      success: false,
      error: [
        'No object metadata was found: a data model needs objects/<Object>/fields/<Field>.field-meta.xml (source format) or objects/<Object>.object (metadata format) in the upload.',
        notFound.length > 0 ? `Not in the upload: ${notFound.join(', ')}.` : '',
      ].filter(Boolean).join(' '),
    };
  }
  const filename = `${dataModelFileName(args.name)}.diagram.json`;
  const text = diagramFileText(diagram);
  await files.writeFile(`/output/${filename}`, Buffer.from(text, 'utf8'));
  const withFields = diagram.entities.filter((entity) => !referenced.includes(entity.id)).map((entity) => entity.id);
  const ownReferenced = referenced.filter((id) => !packageObjects.includes(id));
  const recordTypes = diagram.entities.reduce((sum, entity) => sum + (entity.recordTypes?.length ?? 0), 0);
  return {
    toolCallId,
    success: true,
    content: [
      `Data model written to /output/${filename} from the uploaded metadata: ${withFields.length} ${withFields.length === 1 ? 'object' : 'objects'} with their fields (${withFields.join(', ')}) and ${diagram.relationships.length} ${diagram.relationships.length === 1 ? 'relationship' : 'relationships'}.`,
      args.objects ? '' : 'Without a list of objects it draws the org\'s own: its custom objects, and the standard objects it added fields to.',
      ownReferenced.length > 0 ? `Added without fields, because a field points at them: ${ownReferenced.join(', ')}. Name them in objects to include their fields.` : '',
      packageObjects.length > 0 ? `From installed packages, drawn collapsed where the org's objects point at them: ${packageObjects.join(', ')}. The org can't change them; name one in objects to see its fields.` : '',
      packageFieldCount > 0 ? `${packageFieldCount} ${packageFieldCount === 1 ? 'field' : 'fields'} from installed packages are left out of the org's objects and counted on each (packageFieldCount).` : '',
      `Each object carries its sharing model (sharingModel, externalSharingModel)${recordTypes > 0 ? ` and record types (${recordTypes} in all)` : ''}; picklists that take their values from a value set name it (valueSet).`,
      notFound.length > 0 ? `Not in the upload: ${notFound.join(', ')}.` : '',
      'Each object and field names its source file. It is the user\'s diagram: to change it, read the file, change only what the question needs (objects or fields you design are marked "assumed"), and save it to the same name. Set a title and summary that say what it covers.',
    ].filter(Boolean).join('\n'),
    dataOutputs: [{ filename, base64: Buffer.from(text, 'utf8').toString('base64'), size: Buffer.byteLength(text, 'utf8') }],
  };
}

/**
 * operation=flow_diagram: each named Flow (or, chained, one picture of them and
 * every flow they start) as a process diagram, /output/flow_<name>.diagram.json,
 * written into the sandbox and returned for capture, which makes each a diagram.
 */
async function writeSalesforceFlowDiagrams(
  files: SandboxFiles,
  toolCallId: string,
  sourceFiles: SalesforceSourceFile[],
  args: SalesforceMetadataAuditArgs,
): Promise<ToolResult> {
  const wanted = args.flows ?? [];
  if (wanted.length === 0) {
    return { toolCallId, success: false, error: 'operation=flow_diagram needs flows: the Flow API names to draw (search the inventory for flows first).' };
  }
  const { results, notFound } = buildSalesforceFlowDiagrams(sourceFiles, { flows: wanted, chain: args.chain === true });
  if (results.length === 0) {
    return { toolCallId, success: false, error: `No Flow file was found for ${notFound.join(', ')}: a Flow needs flows/<Name>.flow-meta.xml (source format) or flows/<Name>.flow in the upload.` };
  }
  const named = results.length === 1 && args.name;
  const lines: string[] = [];
  const dataOutputs: NonNullable<ToolResult['dataOutputs']> = [];
  for (const result of results) {
    const fallback = args.chain ? `flow_chain_${result.flows[0]}` : `flow_${result.flows[0]}`;
    const filename = `${dataModelFileName(named ? args.name : undefined, dataModelFileName(fallback))}.diagram.json`;
    const text = diagramFileText(result.diagram);
    await files.writeFile(`/output/${filename}`, Buffer.from(text, 'utf8'));
    dataOutputs.push({ filename, base64: Buffer.from(text, 'utf8').toString('base64'), size: Buffer.byteLength(text, 'utf8') });
    const { nodes, flows } = result.diagram;
    lines.push(`${args.chain ? 'Flow chain' : 'Flow'} written to /output/${filename}: ${result.flows.length > 1 ? `${result.flows.length} flows (${result.flows.join(', ')}), ` : `${result.flows[0]}, `}${nodes.length} nodes and ${flows.length} flows.${result.issueCount > 0 ? ` ${result.issueCount} ${result.issueCount === 1 ? 'element has' : 'elements have'} no fault path (each carries an issue).` : ''}`);
    if (result.links.length > 0) {
      lines.push(`Links followed: ${result.links.map((link) => `${link.from}.${link.fromElement} → ${link.flow} (${link.label})`).join('; ')}.`);
    }
    for (const [flow, elements] of Object.entries(result.unreachable)) {
      lines.push(`In ${flow}, nothing connects to ${elements.join(', ')}: they never run, so they aren't drawn.`);
    }
  }
  if (args.chain) lines.push('A chain follows subflows, platform events a flow or its invocable Apex publishes, and flows Apex starts. A record change that triggers another flow is not followed: that needs the org.');
  if (notFound.length > 0) lines.push(`No Flow file for: ${notFound.join(', ')}.`);
  lines.push('Each node names the Flow file it came from and its element type; the start says what triggers the flow and its entry conditions. It is the user\'s diagram, drawn from metadata (platform "salesforce": no simulation). To change it, read the file, change only what the question needs (nodes you design are marked "assumed"), and save it to the same name.');
  return { toolCallId, success: true, content: lines.join('\n'), dataOutputs };
}
