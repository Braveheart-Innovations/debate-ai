/**
 * Moved from symposium-ai-web src/services/analyze/orchestrator/tools/executeSalesforceMetadataAuditTool.ts
 * (Phase 3 Step 5); the sandbox filesystem is injected. One fix since: every
 * artifact is also written at /output/<filename> (see buildFilesystemEntry).
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import type { SalesforceMetadataAuditArgs, SalesforceMetadataAuditOperation } from '../../contract/lib/ai/tools/built-in/salesforce-metadata-audit';
import { SALESFORCE_ANALYSIS_LENSES } from '../../contract/config/analysis-lenses';
import type { SandboxFiles } from './sandboxFiles';
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
} from '../../salesforce/SalesforceMetadataService';

const DEFAULT_OPERATION: SalesforceMetadataAuditOperation = 'audit';
const SALESFORCE_OUTPUT_ROOT = '/output/salesforce';
const SALESFORCE_DATA_ROOT = '/data/salesforce';

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
    const { sourceFiles, insightPackets, invalidInsightPackets } = await loadSalesforceWorkspaceInputs(files, parsedArgs.paths);

    if (sourceFiles.length === 0) {
      return {
        toolCallId,
        success: false,
        error: 'No Salesforce metadata source files were found. Upload a Salesforce DX project ZIP, metadata ZIP, or source files such as .cls, .trigger, *-meta.xml, package.xml, or sfdx-project.json. Optional agent insight packets can be included under .symposium/salesforce-insights/<run-id>/ alongside the source.',
      };
    }

    const index = buildSalesforceMetadataIndex(sourceFiles, parsedArgs.paths || [], insightPackets, parsedArgs.query);
    const artifactFiles = parsedArgs.include_artifacts === false
      ? []
      : buildArtifactFiles(index, parsedArgs, invalidInsightPackets);
    const filesystemArtifacts = artifactFiles.length > 0
      ? await persistArtifactFilesToFilesystem(files, artifactFiles)
      : [];
    const content = buildOperationContent(index, parsedArgs, filesystemArtifacts, invalidInsightPackets);
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
  };
}

function isOperation(value: string): value is SalesforceMetadataAuditOperation {
  return ['audit', 'inventory', 'search', 'component', 'dependencies', 'risks', 'packet_findings', 'handoff', 'feature_readiness', 'troubleshooting'].includes(value);
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
        `Component: ${component.name} (${component.type})`,
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
      { filename: 'salesforce-vscode-handoff.json', content: JSON.stringify(buildSalesforceVsCodeHandoff(index, args.query), null, 2) },
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
      { filename: 'salesforce-vscode-handoff.json', content: JSON.stringify(buildSalesforceVsCodeHandoff(index, args.query), null, 2) },
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
      content: JSON.stringify(manifest, null, 2),
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

  for (const file of files) {
    const entry = entries.find((item) => item.filename === file.filename)!;
    await writeTextFile(sandbox, entry.outputPath, file.content);
    await writeTextFile(sandbox, entry.dataPath, file.content);
    for (const aliasPath of entry.aliases) {
      await writeTextFile(sandbox, aliasPath, file.content);
    }
  }

  return entries;
}

async function writeTextFile(sandbox: SandboxFiles, path: string, content: string): Promise<void> {
  const bytes = new TextEncoder().encode(content);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await sandbox.mountFile(path.split('/').pop() || 'artifact.txt', buffer, path);
}

function encodeArtifactOutputs(outputs: SalesforceArtifactFile[]): NonNullable<ToolResult['dataOutputs']> {
  return outputs.map((output) => {
    const encoded = encodeTextOutput(output.content);
    return {
      filename: output.filename,
      base64: encoded.base64,
      size: encoded.size,
    };
  });
}

function encodeTextOutput(content: string): { base64: string; size: number } {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return {
    base64: btoa(binary),
    size: bytes.byteLength,
  };
}
