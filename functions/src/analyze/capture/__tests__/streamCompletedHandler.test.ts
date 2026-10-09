/**
 * Ported from symposium-ai-web src/context/analyze/__tests__/streamCompletedHandler.test.ts
 * (Phase 3 Step 3). Cases unchanged; the deps drop the browser's sync gates for
 * the server's clock, and the two IndexedDB local-save cases (#6) stay with
 * the web app, since the server has no local store.
 */
import {
  handleStreamCompleted,
  sanitizeToolExecutionResultsForPersistence,
  type StreamCompletedDeps,
  type StreamCompletedEventData,
} from '../streamCompletedHandler';
import type { AnalyzeAction } from '../types';
import type { Message, ToolResultProvenance } from '../../contract/types';
import type { Artifact, BundleManifest } from '../../contract/types/notebook';
import { createDefaultAnalyzeOutputSelection } from '../../contract/types/analyze';
import { encodeUtf8ToBase64 } from '../../contract/lib/encoding/utf8Base64';
import type { TeamPanelRecord } from '../teamPanelNote';

jest.mock('../artifacts', () => ({
  isReportMaterialArtifact: (artifact: Artifact) => artifact.metadata?.artifactDisposition === 'report_material',
  withArtifactPreviewMetadata: (artifact: Artifact) => artifact,
  deriveArtifactLineage: (prior: Artifact) => ({
    lineageRootId: prior.metadata?.lineageRootId ?? prior.id,
    versionNumber: (prior.metadata?.versionNumber ?? 1) + 1,
    previousArtifactId: prior.id,
  }),
}));

function makeManifest(): BundleManifest {
  return {
    version: 1,
    entryPoint: 'site/index.html',
    files: {
      'site/index.html': {
        mimeType: 'text/html',
        content: '<html><head><link rel="stylesheet" href="styles.css"></head><body><a href="detail.html">Detail</a></body></html>',
        size: 122,
      },
      'site/detail.html': {
        mimeType: 'text/html',
        content: '<html><head><link rel="stylesheet" href="styles.css"></head><body>Detail</body></html>',
        size: 86,
      },
      'site/styles.css': {
        mimeType: 'text/css',
        content: 'body { color: #111; }',
        size: 21,
      },
    },
  };
}

describe('handleStreamCompleted bundle outputs', () => {
  it('persists explicit bundleOutputs as one artifact_bundle', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      {
        id: 'ai-1',
        sender: 'AI',
        senderType: 'ai',
        content: '',
        timestamp: 1,
      },
    ];
    const actions: AnalyzeAction[] = [];

    handleStreamCompleted(
      {
        messageId: 'ai-1',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'assemble_html_bundle',
              arguments: '{"entryPoint":"site/index.html","files":["site/index.html","site/detail.html","site/styles.css"]}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'assemble_html_bundle',
            success: true,
            content: 'Assembled HTML bundle.',
            bundleOutputs: [
              {
                name: 'Stakeholder Site',
                manifest: makeManifest(),
                sourceFiles: ['site/index.html', 'site/detail.html', 'site/styles.css'],
              },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          actions.push(action);
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
          if (action.type === 'UPDATE_MESSAGE') {
            const message = messages.find((item) => item.id === action.payload.id);
            if (message) {
              message.content = action.payload.content;
              message.metadata = action.payload.metadata;
            }
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'linked_mini_website', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    const addedArtifacts = actions.filter((action) => action.type === 'ADD_ARTIFACT');
    expect(addedArtifacts).toHaveLength(1);
    const artifact = addedArtifacts[0].payload as Artifact;
    expect(artifact.type).toBe('artifact_bundle');
    expect(artifact.name).toBe('Stakeholder Site');
    expect(JSON.parse(artifact.data)).toMatchObject({
      entryPoint: 'site/index.html',
    });
    expect(actions.some((action) => action.type === 'ADD_ARTIFACT' && action.payload.type === 'html')).toBe(false);
    expect(actions.some((action) => action.type === 'ADD_ARTIFACT' && action.payload.type === 'data')).toBe(false);
  });

  it('persists analysis artifact specs without auto-generating public derived artifacts', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      {
        id: 'ai-2',
        sender: 'AI',
        senderType: 'ai',
        content: '',
        timestamp: 1,
      },
    ];
    const actions: AnalyzeAction[] = [];
    const spec = {
      version: 1,
      kind: 'analysis_artifact_spec',
      title: 'Stakeholder Plan',
      summary: 'A sourced plan [S1].',
      pages: [
        {
          slug: 'overview',
          title: 'Overview',
          blocks: [
            { kind: 'markdown', markdown: 'A useful plan [S1].' },
          ],
        },
      ],
      sources: [
        { id: 'S1', label: 'Uploaded audit', sourceArtifactId: 'audit-1' },
      ],
    };
    const encodedSpec = btoa(JSON.stringify(spec));

    handleStreamCompleted(
      {
        messageId: 'ai-2',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'call-2',
            type: 'function',
            function: {
              name: 'write_output_file',
              arguments: '{"path":"/output/stakeholder.analysis-artifact.json"}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'write_output_file',
            success: true,
            content: 'Wrote spec.',
            dataOutputs: [
              {
                filename: 'stakeholder.analysis-artifact.json',
                base64: encodedSpec,
                size: encodedSpec.length,
              },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          actions.push(action);
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
          if (action.type === 'UPDATE_MESSAGE') {
            const message = messages.find((item) => item.id === action.payload.id);
            if (message) {
              message.content = action.payload.content;
              message.metadata = action.payload.metadata;
            }
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    expect(artifacts.map((artifact) => artifact.type)).toEqual(['analysis_artifact_spec']);
    expect(artifacts[0].name).toBe('stakeholder.analysis-artifact.json');
    expect(artifacts[0].metadata?.reportSpecVersion).toBe(1);
  });

  it('flags a declared-but-invalid spec with a validation report instead of silently downgrading', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      { id: 'ai-2', sender: 'AI', senderType: 'ai', content: '', timestamp: 1 },
    ];
    // Declares the spec kind but is invalid (pages must have at least one entry).
    const invalidSpec = {
      version: 1,
      kind: 'analysis_artifact_spec',
      title: 'Broken Report',
      summary: 'S',
      pages: [],
    };
    const encodedSpec = btoa(JSON.stringify(invalidSpec));

    handleStreamCompleted(
      {
        messageId: 'ai-2',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'call-2',
            type: 'function',
            function: {
              name: 'write_output_file',
              arguments: '{"path":"/output/broken_report.json"}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'write_output_file',
            success: true,
            content: 'Wrote spec.',
            dataOutputs: [
              { filename: 'broken_report.json', base64: encodedSpec, size: encodedSpec.length },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].type).toBe('data');
    const report = artifacts[0].metadata?.validationReport;
    expect(report?.valid).toBe(false);
    expect(report?.errors.join('\n')).toContain('will NOT appear in Reports');
    expect(report?.errors.join('\n')).toContain('pages');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('preserves multi-byte UTF-8 text in a spec (no mojibake from Latin-1 base64 decode)', () => {
    // Regression: the capture path decoded the tool-output base64 with bare atob
    // (Latin-1), so a curly apostrophe (U+2019, UTF-8 E2 80 99) baked into the
    // stored spec as "â€™". Decoding as UTF-8 keeps the character intact.
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      { id: 'user-utf8', sender: 'You', senderType: 'user', content: 'Brief Apple', timestamp: 0 },
      { id: 'ai-utf8', sender: 'AI', senderType: 'ai', content: '', timestamp: 1 },
    ];
    const spec = {
      version: 1,
      kind: 'analysis_artifact_spec',
      title: 'Apple FY2025 10-K Executive Brief',
      summary: "Leadership brief on Apple Inc.’s most recent Form 10-K — curly quotes & em dash.",
      pages: [
        {
          slug: 'overview',
          title: 'Overview',
          blocks: [{ kind: 'markdown', markdown: "Apple’s most recent 10-K — café résumé." }],
        },
      ],
      sources: [],
    };
    // Encode the way the real sandbox/write-output capture does: base64 of UTF-8 bytes.
    const encodedSpec = encodeUtf8ToBase64(JSON.stringify(spec));

    handleStreamCompleted(
      {
        messageId: 'ai-utf8',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'call-utf8',
            type: 'function',
            function: { name: 'write_output_file', arguments: '{"path":"/output/apple.analysis-artifact.json"}' },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'write_output_file',
            success: true,
            content: 'Wrote spec.',
            dataOutputs: [
              { filename: 'apple.analysis-artifact.json', base64: encodedSpec, size: encodedSpec.length },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          if (action.type === 'ADD_ARTIFACT') artifacts.push(action.payload);
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-utf8' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    expect(artifacts).toHaveLength(1);
    const stored = artifacts[0].data;
    expect(stored).not.toContain('â€'); // no "â€…" mojibake prefix
    const reparsed = JSON.parse(stored);
    expect(reparsed.summary).toBe(spec.summary);
    expect(reparsed.summary).toContain('’');
    expect(reparsed.pages[0].blocks[0].markdown).toBe(spec.pages[0].blocks[0].markdown);
  });

  it('suppresses internal Salesforce audit packet artifacts for rich HTML runs', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      {
        id: 'user-3',
        sender: 'User',
        senderType: 'user',
        content: 'Audit this workspace',
        timestamp: 0,
        metadata: {
          selectedAnalysisLensIds: [
            'salesforce_stakeholder_audit',
            'salesforce_dependency_impact',
          ],
        },
      },
      {
        id: 'ai-3',
        sender: 'AI',
        senderType: 'ai',
        content: '',
        timestamp: 1,
      },
    ];
    const actions: AnalyzeAction[] = [];
    const encode = (value: unknown) => btoa(typeof value === 'string' ? value : JSON.stringify(value));
    const dataOutputs = [
      {
        filename: 'salesforce-component-index.json',
        base64: encode({
          generatedAt: '2026-05-10T12:00:00.000Z',
          sourceSummary: {
            fileCount: 3,
            componentCount: 2,
            totalBytes: 4096,
            recognizedTypes: { apex_class: 1, flow: 1 },
            importedFindingCount: 1,
            safetyBoundary: 'Read-only metadata analysis only.',
          },
          components: [
            { id: 'apex:AccountService', name: 'AccountService', type: 'apex_class', path: 'force-app/classes/AccountService.cls', references: [] },
            { id: 'flow:AccountFlow', name: 'AccountFlow', type: 'flow', path: 'force-app/flows/AccountFlow.flow-meta.xml', references: [] },
          ],
          importedFindings: [{ id: 'finding-1' }],
        }),
        size: 400,
      },
      {
        filename: 'salesforce-dependency-map.json',
        base64: encode({
          nodes: [
            { id: 'apex:AccountService', name: 'AccountService', type: 'apex_class' },
            { id: 'flow:AccountFlow', name: 'AccountFlow', type: 'flow' },
          ],
          edges: [{ sourceId: 'flow:AccountFlow', targetId: 'apex:AccountService', relationship: 'uses' }],
          importedFindingEdges: [],
        }),
        size: 300,
      },
      {
        filename: 'salesforce-metadata-audit-report.md',
        base64: encode('# Salesforce Audit\n\nReview broad access.'),
        size: 40,
      },
      {
        filename: 'salesforce-remediation-backlog.json',
        base64: encode([
          { source: 'metadata_audit', priority: 'high', title: 'Reduce access', targetComponent: 'AccountService', desiredChange: 'Narrow permissions.' },
          { source: 'agent_insight_packet', priority: 'medium', title: 'Review flow', targetComponents: ['AccountFlow'], desiredChange: 'Validate imported finding.' },
        ]),
        size: 260,
      },
      {
        filename: 'salesforce-signal-evidence.json',
        base64: encode({
          version: 1,
          signals: [{ ruleId: 'permissions.powerful-permission', componentType: 'permission_set' }],
        }),
        size: 180,
      },
      {
        filename: 'salesforce-workbench-summary.json',
        base64: encode({
          version: 1,
          docsVerification: { status: 'pending_docs_lookup' },
        }),
        size: 160,
      },
      {
        filename: 'salesforce-vscode-handoff.json',
        base64: encode({
          summary: 'Stay read-only until reviewed.',
          remediationTasks: [
            { priority: 'high', title: 'Add tests', desiredChange: 'Cover permission behavior.' },
          ],
        }),
        size: 180,
      },
      {
        filename: 'salesforce-doc-topics.json',
        base64: encode({
          version: 1,
          topics: [{ id: 'apex-governor-limits', label: 'Apex governor limits' }],
        }),
        size: 140,
      },
      {
        filename: 'salesforce-doc-evidence.json',
        base64: encode({
          version: 1,
          sources: [{ url: 'https://developer.salesforce.com/docs' }],
        }),
        size: 120,
      },
      {
        filename: 'artifact-manifest.json',
        base64: encode({ version: 1, files: [] }),
        size: 30,
      },
    ];

    handleStreamCompleted(
      {
        messageId: 'ai-3',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'call-3',
            type: 'function',
            function: {
              name: 'salesforce_metadata_audit',
              arguments: '{"operation":"audit"}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'salesforce_metadata_audit',
            success: true,
            content: 'Audit complete.',
            dataOutputs,
          },
        ],
      },
      {
        dispatch: (action) => {
          actions.push(action);
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
          if (action.type === 'UPDATE_MESSAGE') {
            const message = messages.find((item) => item.id === action.payload.id);
            if (message) {
              message.content = action.payload.content;
              message.metadata = action.payload.metadata;
            }
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    expect(artifacts).toHaveLength(0);
    expect(actions.some((action) => (
      action.type === 'ADD_ARTIFACT'
      && action.payload.metadata?.salesforceLensRun === true
    ))).toBe(false);
  });

  it('keeps Salesforce packet artifacts only when portable JSON or Markdown output is selected', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      {
        id: 'ai-4',
        sender: 'AI',
        senderType: 'ai',
        content: '',
        timestamp: 1,
      },
    ];
    const actions: AnalyzeAction[] = [];
    const encodedIndex = btoa(JSON.stringify({
      generatedAt: '2026-05-10T12:00:00.000Z',
      sourceSummary: { fileCount: 1, componentCount: 1 },
      components: [{ id: 'apex:AccountService', name: 'AccountService', type: 'apex_class' }],
    }));

    handleStreamCompleted(
      {
        messageId: 'ai-4',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'call-4',
            type: 'function',
            function: {
              name: 'salesforce_metadata_audit',
              arguments: '{"operation":"inventory"}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'salesforce_metadata_audit',
            success: true,
            content: 'Inventory complete.',
            dataOutputs: [
              {
                filename: 'salesforce-component-index.json',
                base64: encodedIndex,
                size: encodedIndex.length,
              },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          actions.push(action);
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'portable',
            portable: { formats: ['json'] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      name: 'salesforce-component-index.json',
      type: 'salesforce_component_index',
      metadata: {
        salesforceLensRun: true,
        salesforceRole: 'component_index',
        salesforceLensIds: ['salesforce_stakeholder_audit'],
      },
    });
  });

  it('suppresses incidental Salesforce text scratch files when a report is produced', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      {
        id: 'user-5',
        sender: 'User',
        senderType: 'user',
        content: 'Create an HTML Salesforce flow audit',
        timestamp: 0,
        metadata: {
          selectedAnalysisLensIds: ['salesforce_stakeholder_audit'],
        },
      },
      {
        id: 'ai-5',
        sender: 'AI',
        senderType: 'ai',
        content: '',
        timestamp: 1,
      },
    ];
    const encode = (value: string) => btoa(value);
    const actions: AnalyzeAction[] = [];
    const specInline = JSON.stringify({
      version: 1,
      kind: 'analysis_artifact_spec',
      title: 'Flow Audit',
      summary: 'Salesforce flow audit.',
      pages: [{ slug: 'p', title: 'P', blocks: [{ kind: 'markdown', markdown: 'Audit.' }] }],
    });

    handleStreamCompleted(
      {
        messageId: 'ai-5',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'call-5',
            type: 'function',
            function: {
              name: 'write_output_file',
              arguments: '{"path":"/output/flow_audit_report.json"}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'write_output_file',
            success: true,
            content: 'Wrote report, HTML component, and scratch files.',
            dataOutputs: [
              {
                filename: 'flow_inventory.txt',
                base64: encode('scratch inventory'),
                size: 17,
              },
              {
                filename: 'flow_complexity.txt',
                base64: encode('scratch complexity'),
                size: 18,
              },
              {
                filename: 'flow_audit_report.html',
                base64: encode('<!doctype html><html><body>Flow audit</body></html>'),
                size: 51,
              },
              {
                filename: 'flow_audit_report.json',
                base64: encode(specInline),
                size: specInline.length,
              },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          actions.push(action);
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
          if (action.type === 'UPDATE_MESSAGE') {
            const message = messages.find((item) => item.id === action.payload.id);
            if (message) {
              message.content = action.payload.content;
              message.metadata = action.payload.metadata;
            }
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    // The structured report is the only visible deliverable; the HTML component is
    // kept as hidden backing; the incidental .txt scratch is dropped entirely.
    const visible = artifacts.filter((a) => a.metadata?.artifactDisposition !== 'report_material');
    expect(visible.map((a) => a.name)).toEqual(['flow_audit_report.json']);
    expect(visible[0].type).toBe('analysis_artifact_spec');
    expect(artifacts.some((a) => (
      a.type === 'html' && a.metadata?.artifactDisposition === 'report_material'
    ))).toBe(true);
    expect(actions.some((action) => (
      action.type === 'ADD_ARTIFACT'
      && action.payload.name.endsWith('.txt')
    ))).toBe(false);
  });

  it('attaches same-run fetch provenance to write_output_file HTML and auto-injects a Sources section', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      {
        id: 'ai-6',
        sender: 'AI',
        senderType: 'ai',
        content: '',
        timestamp: 1,
      },
    ];
    const actions: AnalyzeAction[] = [];
    const provenance: ToolResultProvenance = {
      tool: 'fetch_api',
      connectorId: 'fred',
      endpoint: 'https://api.stlouisfed.org/fred/series/observations',
      method: 'GET',
      parameters: { series_id: 'CPIAUCSL' },
      parameterHash: 'params-hash',
      responseHash: 'response-hash',
      fetchedAt: '2026-05-16T12:00:00.000Z',
      cacheStatus: 'fresh',
    };
    const html = '<!doctype html><html><body><main><h1>Inflation Report</h1><p>CPI changed.</p></main></body></html>';

    handleStreamCompleted(
      {
        messageId: 'ai-6',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'fetch-call',
            type: 'function',
            function: {
              name: 'fetch_api',
              arguments: '{"url":"https://api.stlouisfed.org/fred/series/observations"}',
            },
          },
          {
            id: 'write-call',
            type: 'function',
            function: {
              name: 'write_output_file',
              arguments: '{"path":"/output/inflation-report.html"}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'fetch_api',
            success: true,
            content: '{"observations":[]}',
            provenance,
          },
          {
            toolName: 'write_output_file',
            success: true,
            content: 'Wrote HTML.',
            dataOutputs: [
              {
                filename: 'inflation-report.html',
                base64: btoa(html),
                size: html.length,
              },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          actions.push(action);
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
          if (action.type === 'UPDATE_MESSAGE') {
            const message = messages.find((item) => item.id === action.payload.id);
            if (message) {
              message.content = action.payload.content;
              message.metadata = action.payload.metadata;
            }
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      name: 'inflation-report.html',
      type: 'html',
      profile: 'SESSION_STATIC_REPORT',
      provenance: {
        generator: 'write_output_file',
        sources: [provenance],
      },
    });
    // The Sources section is now injected app-side from the captured provenance,
    // so the artifact contains it and the citation policy findings are cleared.
    expect(artifacts[0].data).toContain('[S1]');
    expect(artifacts[0].data).toMatch(/<h2[^>]*>Sources<\/h2>/i);
    expect(artifacts[0].data).toContain('api.stlouisfed.org');
    expect(artifacts[0].policyReport?.violations.some((violation) => (
      violation.rule === 'missing-provenance-references'
    ))).toBe(false);
    expect(artifacts[0].policyReport?.violations.some((violation) => (
      violation.rule === 'missing-inline-citations'
    ))).toBe(false);
  });

  it('clears citation policy findings for sourced write_output_file HTML with references', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      {
        id: 'ai-7',
        sender: 'AI',
        senderType: 'ai',
        content: '',
        timestamp: 1,
      },
    ];
    const provenance: ToolResultProvenance = {
      tool: 'salesforce_docs_lookup',
      connectorId: 'salesforce-docs',
      endpoint: 'https://developer.salesforce.com/docs/platform',
      method: 'GET',
      parameters: { query: 'Apex governor limits' },
      parameterHash: 'docs-params',
      responseHash: 'docs-response',
      fetchedAt: '2026-05-16T13:00:00.000Z',
      cacheStatus: 'fresh',
    };
    const html = [
      '<!doctype html><html><body><main>',
      '<h1>Salesforce Docs Brief</h1>',
      '<p>Governor limits apply to Apex transactions [1].</p>',
      '<h2>References</h2><ol><li>Salesforce Developer Documentation</li></ol>',
      '</main></body></html>',
    ].join('');

    handleStreamCompleted(
      {
        messageId: 'ai-7',
        finalContent: 'Done',
        toolCalls: [
          {
            id: 'docs-call',
            type: 'function',
            function: {
              name: 'salesforce_docs_lookup',
              arguments: '{"query":"Apex governor limits"}',
            },
          },
          {
            id: 'write-call',
            type: 'function',
            function: {
              name: 'write_output_file',
              arguments: '{"path":"/output/salesforce-docs-brief.html"}',
            },
          },
        ],
        toolExecutionResults: [
          {
            toolName: 'salesforce_docs_lookup',
            success: true,
            content: 'Docs found.',
            provenance,
          },
          {
            toolName: 'write_output_file',
            success: true,
            content: 'Wrote HTML.',
            dataOutputs: [
              {
                filename: 'salesforce-docs-brief.html',
                base64: btoa(html),
                size: html.length,
              },
            ],
          },
        ],
      },
      {
        dispatch: (action) => {
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
          if (action.type === 'UPDATE_MESSAGE') {
            const message = messages.find((item) => item.id === action.payload.id);
            if (message) {
              message.content = action.payload.content;
              message.metadata = action.payload.metadata;
            }
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: {
            ...createDefaultAnalyzeOutputSelection(),
            mode: 'rich',
            rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
          },
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab: jest.fn(),
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].provenance?.sources).toEqual([provenance]);
    expect(artifacts[0].policyReport?.violations.some((violation) => (
      violation.rule === 'missing-provenance-references'
      || violation.rule === 'missing-inline-citations'
    ))).toBe(false);
  });
});

// Regression guards for the general (non-Salesforce) intent-gated surfacing fix:
// a prior change had narrowed intermediate suppression to Salesforce-only, so a
// plain Rich "single HTML" run leaked the CSV/dataset/auto-workbook scratch.
// These prove the contract for ALL use cases: ask for one HTML site, see only it.
describe('handleStreamCompleted general intent-gated surfacing (non-Salesforce)', () => {
  const csv = 'year,gdp\n2020,21000\n2021,23000';
  const richHtml = {
    ...createDefaultAnalyzeOutputSelection(),
    mode: 'rich' as const,
    rich: { type: 'single_page_html' as const, documentPreset: 'general_report' as const, packages: [] },
  };
  const csvResult = (toolName: string) => ({
    toolName,
    success: true,
    content: 'Computed dataset.',
    dataOutputs: [{ filename: 'summary_table.csv', base64: btoa(csv), size: csv.length }],
  });
  const htmlResult = (content: string) => ({
    toolName: 'write_output_file',
    success: true,
    content: 'Wrote HTML.',
    htmlOutputs: [{ content, filename: 'report.html' }],
  });
  const richHtmlString = '<!doctype html><html><body><main><h1>GDP</h1></main></body></html>';
  const imageResult = () => ({
    toolName: 'execute_python',
    success: true,
    content: 'Charted.',
    images: [{ mimeType: 'image/png', base64: btoa('PNG-AUTO-CAPTURE-BYTES') }],
  });
  // The structured report is the deliverable now; a valid analysis_artifact_spec
  // among the JSON outputs triggers suppression of the run's backing material.
  const specJson = JSON.stringify({
    version: 1,
    kind: 'analysis_artifact_spec',
    title: 'GDP',
    summary: 'GDP over time.',
    pages: [{ slug: 'p', title: 'P', blocks: [{ kind: 'markdown', markdown: 'Prose.' }] }],
  });
  const specResult = () => ({
    toolName: 'write_output_file',
    success: true,
    content: 'Wrote report.',
    dataOutputs: [{ filename: 'report.json', base64: btoa(specJson), size: specJson.length }],
  });

  const visibleArtifacts = (artifacts: Artifact[]) =>
    artifacts.filter((artifact) => artifact.metadata?.artifactDisposition !== 'report_material');

  const reportMaterials = (artifacts: Artifact[]) =>
    artifacts.filter((artifact) => artifact.metadata?.artifactDisposition === 'report_material');

  function runHandler(options: {
    outputSelection: ReturnType<typeof createDefaultAnalyzeOutputSelection>;
    toolCalls: NonNullable<StreamCompletedEventData['toolCalls']>;
    toolExecutionResults: NonNullable<StreamCompletedEventData['toolExecutionResults']>;
    artifacts?: Artifact[];
    messages?: Message[];
    messageId?: string;
    addDataTab?: jest.Mock;
    teamPanel?: TeamPanelRecord | null;
  }): { artifacts: Artifact[]; addDataTab: jest.Mock } {
    const messageId = options.messageId ?? 'ai-gen';
    const artifacts = options.artifacts ?? [];
    const messages = options.messages ?? [
      { id: messageId, sender: 'AI', senderType: 'ai', content: '', timestamp: 1 },
    ];
    const addDataTab = options.addDataTab ?? jest.fn();

    handleStreamCompleted(
      {
        messageId,
        finalContent: 'Done',
        toolCalls: options.toolCalls,
        toolExecutionResults: options.toolExecutionResults,
      },
      {
        dispatch: (action) => {
          if (action.type === 'ADD_ARTIFACT') {
            artifacts.push(action.payload);
          }
          if (action.type === 'REMOVE_ARTIFACT') {
            const idx = artifacts.findIndex((item) => item.id === action.payload);
            if (idx >= 0) artifacts.splice(idx, 1);
          }
          if (action.type === 'UPDATE_MESSAGE') {
            const message = messages.find((item) => item.id === action.payload.id);
            if (message) {
              message.content = action.payload.content;
              message.metadata = action.payload.metadata;
            }
          }
        },
        getState: () => ({
          artifacts,
          outputSelection: options.outputSelection,
          currentSession: { id: 'session-1' },
          messages,
        }),
        now: () => Date.now(),
        persistMessage: jest.fn(),
        getFetchProvenanceMap: () => new Map(),
        getTeamPanel: () => options.teamPanel ?? null,
        setFetchProvenanceMap: jest.fn(),
        setLatestCompletedOperatorMessageId: jest.fn(),
        getSessionWorkbookManager: () => ({
          initialized: true,
          reset: jest.fn(),
          addDataTab,
        }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
      },
    );

    return { artifacts, addDataTab };
  }

  describe('independent panel note', () => {
    const panel: TeamPanelRecord = {
      operatorName: 'ChatGPT',
      panelists: [
        { name: 'Gemini', model: 'Gemini 3.8 Flash', status: 'completed' },
        { name: 'Kimi', model: 'Kimi K3', status: 'completed' },
      ],
    };
    const rich = {
      ...createDefaultAnalyzeOutputSelection(),
      mode: 'rich' as const,
      rich: { type: 'single_page_html' as const, documentPreset: 'general_report' as const, packages: [] },
    };
    const writeSpec = (title: string, text: string) => {
      const spec = btoa(JSON.stringify({
        version: 1, kind: 'analysis_artifact_spec', title, summary: title,
        pages: [{ slug: 'p', title: 'P', blocks: [{ kind: 'markdown', markdown: text }] }],
      }));
      return {
        toolCalls: [{ id: 'w', type: 'function' as const, function: { name: 'write_output_file', arguments: '{"path":"/output/report.json"}' } }],
        toolExecutionResults: [{
          toolName: 'write_output_file', success: true, content: 'Wrote spec.',
          dataOutputs: [{ filename: 'report.json', base64: spec, size: spec.length }],
        }],
      };
    };
    const firstBlock = (artifact: Artifact) => JSON.parse(artifact.data).pages[0].blocks[0];

    it('bakes the panel into the report spec and its metadata', () => {
      const { artifacts } = runHandler({ outputSelection: rich, teamPanel: panel, ...writeSpec('Revenue', 'Findings') });

      const report = artifacts.find((a) => a.type === 'analysis_artifact_spec')!;
      expect(firstBlock(report)).toMatchObject({
        id: 'app-team-panel',
        kind: 'callout',
        body: '**Independent panel.** Gemini (Gemini 3.8 Flash) and Kimi (Kimi K3) each worked this question separately; ChatGPT reconciled their findings.',
      });
      expect(report.metadata?.teamPanel).toEqual(panel);
    });

    it('keeps the note on a later version of the same report (e.g. after review)', () => {
      const first = runHandler({ outputSelection: rich, teamPanel: panel, ...writeSpec('Revenue', 'Findings') });
      const prior = first.artifacts.find((a) => a.type === 'analysis_artifact_spec')!;

      const { artifacts } = runHandler({
        outputSelection: rich,
        teamPanel: null,
        artifacts: [prior],
        ...writeSpec('Revenue', 'Revised findings'),
      });

      // Artifact ids are time-based, so find the new version by its content, not its id.
      const revised = artifacts.find((a) => a.type === 'analysis_artifact_spec' && a.data.includes('Revised findings'))!;
      expect(revised.metadata?.versionNumber).toBe(2);
      expect(firstBlock(revised).id).toBe('app-team-panel');
      expect(revised.metadata?.teamPanel).toEqual(panel);
    });

    it('adds nothing when no panel ran', () => {
      const { artifacts } = runHandler({ outputSelection: rich, ...writeSpec('Solo', 'Findings') });
      const report = artifacts.find((a) => a.type === 'analysis_artifact_spec')!;
      expect(firstBlock(report).kind).toBe('markdown');
      expect(report.metadata?.teamPanel).toBeUndefined();
    });
  });

  it('keeps one Reports row per report: a renamed spec re-save joins the same-title lineage and the sunk data zombie is removed', () => {
    // The live incident: an earlier spec validated (report lineage exists), a
    // later save under a NEW filename sank to 'data' (failed validation at the
    // time), and the post-repair re-save of that file forked a THIRD lineage —
    // three same-title Reports rows.
    const originalSpec: Artifact = {
      id: 'spec-orig',
      cellId: 'c0',
      sessionId: 'session-1',
      name: 'mogli_arb_inform.json',
      type: 'analysis_artifact_spec',
      mimeType: 'application/json',
      data: specJson, // title: 'GDP'
      createdAt: 1000,
    };
    const sunkData: Artifact = {
      id: 'sunk-data',
      cellId: 'c1',
      sessionId: 'session-1',
      name: 'kindercare_arb.json',
      type: 'data',
      mimeType: 'application/json',
      data: btoa(JSON.stringify({ kind: 'analysis_artifact_spec', title: 'GDP', broken: true })),
      createdAt: 2000,
    };

    const { artifacts } = runHandler({
      outputSelection: richHtml,
      artifacts: [originalSpec, sunkData],
      toolCalls: [{ id: 'w', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/kindercare_arb.json"}' } }],
      toolExecutionResults: [{
        toolName: 'write_output_file',
        success: true,
        content: 'Re-saved report.',
        dataOutputs: [{ filename: 'kindercare_arb.json', base64: btoa(specJson), size: specJson.length }],
      }],
    });

    // The validated re-save versions into the ORIGINAL report lineage (same title)…
    const revived = artifacts.find((a) => a.type === 'analysis_artifact_spec' && a.name === 'kindercare_arb.json');
    expect(revived).toBeTruthy();
    expect(revived!.metadata?.lineageRootId).toBe('spec-orig');
    expect(revived!.metadata?.versionNumber).toBe(2);
    // …the original stays as a revertable version, and the zombie is gone.
    expect(artifacts.some((a) => a.id === 'spec-orig')).toBe(true);
    expect(artifacts.some((a) => a.id === 'sunk-data')).toBe(false);
  });

  it('versions a regenerated same-name HTML report (keeps the prior, tags v2 — not a false duplicate)', () => {
    const original: Artifact = {
      id: 'html-orig',
      cellId: 'c0',
      sessionId: 'session-1',
      name: 'report.html',
      type: 'html',
      mimeType: 'text/html',
      // Ends in the same closing tags as the revision — the old slice(-100)
      // fingerprint collided here and dropped the edit entirely.
      data: '<!doctype html><html><body><main><h1>ORIGINAL</h1></main></body></html>',
      createdAt: 1000,
    };

    const { artifacts } = runHandler({
      outputSelection: richHtml,
      artifacts: [original],
      toolCalls: [{ id: 'w', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.html"}' } }],
      toolExecutionResults: [htmlResult('<!doctype html><html><body><main><h1>REVISED EDITION</h1></main></body></html>')],
    });

    // The prior version is kept (recognized as new content, then versioned) ...
    expect(artifacts.some((a) => a.id === 'html-orig')).toBe(true);
    // ... and the revision joins its lineage as version 2.
    const next = artifacts.find((a) => a.type === 'html' && a.name === 'report.html' && a.id !== 'html-orig');
    expect(next).toBeTruthy();
    expect(next!.data).toContain('REVISED EDITION');
    expect(next!.metadata?.lineageRootId).toBe('html-orig');
    expect(next!.metadata?.versionNumber).toBe(2);
    expect(next!.metadata?.previousArtifactId).toBe('html-orig');
  });

  it('versions a regenerated same-name data file in Portable mode (keeps prior, tags lineage)', () => {
    const prior: Artifact = {
      id: 'prior-csv',
      cellId: 'c0',
      sessionId: 'session-1',
      name: 'summary_table.csv',
      type: 'dataset',
      mimeType: 'text/csv',
      data: btoa('stale,old\n9,9'),
      createdAt: 1000,
    };

    const { artifacts } = runHandler({
      outputSelection: {
        ...createDefaultAnalyzeOutputSelection(),
        mode: 'portable' as const,
        portable: { formats: ['csv'] },
      },
      artifacts: [prior],
      toolCalls: [{ id: 'py', type: 'function', function: { name: 'execute_python', arguments: '{}' } }],
      toolExecutionResults: [csvResult('execute_python')],
    });

    expect(artifacts.some((a) => a.id === 'prior-csv')).toBe(true);
    const next = artifacts.find((a) => a.id !== 'prior-csv' && a.name === 'summary_table.csv');
    expect(next).toBeTruthy();
    expect(next!.metadata?.lineageRootId).toBe('prior-csv');
    expect(next!.metadata?.versionNumber).toBe(2);
    expect(next!.metadata?.previousArtifactId).toBe('prior-csv');
  });

  it('versions a same-name analysis_artifact_spec edit in a Rich run (keeps prior, not removed)', () => {
    const priorSpec: Artifact = {
      id: 'prior-spec',
      cellId: 'c0',
      sessionId: 'session-1',
      name: 'report.analysis-artifact.json',
      type: 'analysis_artifact_spec',
      mimeType: 'application/json',
      data: btoa(JSON.stringify({ version: 1, kind: 'analysis_artifact_spec', title: 'Old', summary: 'Old', pages: [] })),
      createdAt: 1000,
      metadata: { reportSpecVersion: 1 },
    };
    const editedSpec = btoa(JSON.stringify({
      version: 1,
      kind: 'analysis_artifact_spec',
      title: 'Edited',
      summary: 'Edited',
      pages: [{ slug: 'p', title: 'P', blocks: [{ kind: 'markdown', markdown: 'New text' }] }],
    }));

    const { artifacts } = runHandler({
      outputSelection: {
        ...createDefaultAnalyzeOutputSelection(),
        mode: 'rich' as const,
        rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
      },
      artifacts: [priorSpec],
      toolCalls: [{ id: 'w', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.analysis-artifact.json"}' } }],
      toolExecutionResults: [{
        toolName: 'write_output_file',
        success: true,
        content: 'Wrote spec.',
        dataOutputs: [{ filename: 'report.analysis-artifact.json', base64: editedSpec, size: editedSpec.length }],
      }],
    });

    // The prior spec is kept (a conversational edit is a new version, not a stale
    // intermediate to remove), and the new spec joins its lineage as version 2.
    expect(artifacts.some((a) => a.id === 'prior-spec')).toBe(true);
    const next = artifacts.find((a) => a.id !== 'prior-spec' && a.name === 'report.analysis-artifact.json');
    expect(next).toBeTruthy();
    expect(next!.type).toBe('analysis_artifact_spec');
    expect(next!.metadata?.lineageRootId).toBe('prior-spec');
    expect(next!.metadata?.versionNumber).toBe(2);
  });

  it('surfaces the report spec and hides CSV + auto-workbook backing when a report is produced', () => {
    const { artifacts, addDataTab } = runHandler({
      outputSelection: richHtml,
      toolCalls: [
        { id: 'py', type: 'function', function: { name: 'execute_python', arguments: '{}' } },
        { id: 'write', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.json"}' } },
      ],
      toolExecutionResults: [csvResult('execute_python'), specResult()],
    });

    expect(visibleArtifacts(artifacts).map((a) => a.type)).toEqual(['analysis_artifact_spec']);
    expect(reportMaterials(artifacts).some((a) => a.type === 'dataset' || a.type === 'data')).toBe(true);
    expect(addDataTab).toHaveBeenCalled();
  });

  it('does NOT suppress data when a Rich run produced no HTML deliverable (no empty-handed runs)', () => {
    const { artifacts, addDataTab } = runHandler({
      outputSelection: richHtml,
      toolCalls: [{ id: 'py', type: 'function', function: { name: 'execute_python', arguments: '{}' } }],
      toolExecutionResults: [csvResult('execute_python')],
    });

    expect(artifacts.some((a) => a.type === 'dataset')).toBe(true);
    expect(addDataTab).toHaveBeenCalled();
  });

  it('does NOT suppress data when the only HTML output is empty (not a real deliverable)', () => {
    const { artifacts } = runHandler({
      outputSelection: richHtml,
      toolCalls: [
        { id: 'py', type: 'function', function: { name: 'execute_python', arguments: '{}' } },
        { id: 'write', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.html"}' } },
      ],
      toolExecutionResults: [csvResult('execute_python'), htmlResult('   ')],
    });

    expect(artifacts.some((a) => a.type === 'dataset')).toBe(true);
  });

  it('surfaces data normally in Portable mode and still builds the session workbook (intent gating is Rich-only)', () => {
    const { artifacts, addDataTab } = runHandler({
      outputSelection: {
        ...createDefaultAnalyzeOutputSelection(),
        mode: 'portable' as const,
        portable: { formats: ['csv'] },
      },
      toolCalls: [{ id: 'py', type: 'function', function: { name: 'execute_python', arguments: '{}' } }],
      toolExecutionResults: [csvResult('execute_python')],
    });

    expect(artifacts.some((a) => a.type === 'dataset')).toBe(true);
    // Positive counterpart to the rich-mode "addDataTab not called" assertion:
    // proves the workbook pipeline still runs end-to-end in Portable mode.
    expect(addDataTab).toHaveBeenCalled();
  });

  it('hides plt.show() auto-captured images as backing when a report is produced', () => {
    const { artifacts } = runHandler({
      outputSelection: richHtml,
      toolCalls: [
        { id: 'py', type: 'function', function: { name: 'execute_python', arguments: '{}' } },
        { id: 'write', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.json"}' } },
      ],
      toolExecutionResults: [imageResult(), specResult()],
    });

    expect(visibleArtifacts(artifacts).map((a) => a.type)).toEqual(['analysis_artifact_spec']);
    expect(reportMaterials(artifacts).some((a) => a.type === 'image')).toBe(true);
  });

  it('hides a CSV produced in the SAME tool result as the report spec (workbook backing)', () => {
    const { artifacts, addDataTab } = runHandler({
      outputSelection: richHtml,
      toolCalls: [
        { id: 'write', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.json"}' } },
      ],
      toolExecutionResults: [
        {
          toolName: 'write_output_file',
          success: true,
          content: 'Wrote report + data.',
          dataOutputs: [
            { filename: 'summary_table.csv', base64: btoa(csv), size: csv.length },
            { filename: 'report.json', base64: btoa(specJson), size: specJson.length },
          ],
        },
      ],
    });

    expect(visibleArtifacts(artifacts).map((a) => a.type)).toEqual(['analysis_artifact_spec']);
    expect(reportMaterials(artifacts).some((a) => a.type === 'dataset' || a.type === 'data')).toBe(true);
    expect(addDataTab).toHaveBeenCalled();
  });

  it('keeps an embedded_html HTML output as hidden backing alongside the report spec + suppressed CSV', () => {
    const { artifacts } = runHandler({
      outputSelection: richHtml,
      toolCalls: [
        { id: 'write', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.json"}' } },
      ],
      toolExecutionResults: [
        {
          toolName: 'write_output_file',
          success: true,
          content: 'Wrote report + data + interactive component.',
          dataOutputs: [
            { filename: 'summary_table.csv', base64: btoa(csv), size: csv.length },
            { filename: 'map.html', base64: btoa(richHtmlString), size: richHtmlString.length },
            { filename: 'report.json', base64: btoa(specJson), size: specJson.length },
          ],
        },
      ],
    });

    // Only the report spec is visible; the CSV and the interactive HTML component are
    // retained as hidden report material so the report can render the embedded_html.
    expect(visibleArtifacts(artifacts).map((a) => a.type)).toEqual(['analysis_artifact_spec']);
    expect(reportMaterials(artifacts).some((a) => a.type === 'html' && a.name === 'map.html')).toBe(true);
    expect(reportMaterials(artifacts).some((a) => a.name === 'summary_table.csv')).toBe(true);
  });

  it('removes a stale prior-turn intermediate when a later turn produces a report spec (multi-turn)', () => {
    const artifacts: Artifact[] = [];
    const messages: Message[] = [
      { id: 'ai-t1', sender: 'AI', senderType: 'ai', content: '', timestamp: 1 },
      { id: 'ai-t2', sender: 'AI', senderType: 'ai', content: '', timestamp: 2 },
    ];
    const addDataTab = jest.fn();

    // Turn 1: no report spec → the CSV correctly surfaces (fallback).
    runHandler({
      outputSelection: richHtml,
      messageId: 'ai-t1',
      artifacts,
      messages,
      addDataTab,
      toolCalls: [{ id: 'py1', type: 'function', function: { name: 'execute_python', arguments: '{}' } }],
      toolExecutionResults: [csvResult('execute_python')],
    });
    expect(artifacts.some((a) => a.type === 'dataset' && a.name === 'summary_table.csv')).toBe(true);

    // Turn 2: re-emit the byte-identical CSV AND produce a report spec. The stale
    // visible CSV must be removed; the CSV is retained as hidden report material.
    runHandler({
      outputSelection: richHtml,
      messageId: 'ai-t2',
      artifacts,
      messages,
      addDataTab,
      toolCalls: [
        { id: 'py2', type: 'function', function: { name: 'execute_python', arguments: '{}' } },
        { id: 'write2', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.json"}' } },
      ],
      toolExecutionResults: [csvResult('execute_python'), specResult()],
    });

    expect(visibleArtifacts(artifacts).some((a) => a.name === 'summary_table.csv')).toBe(false);
    expect(visibleArtifacts(artifacts).some((a) => a.type === 'analysis_artifact_spec')).toBe(true);
    expect(reportMaterials(artifacts).some((a) => a.name === 'summary_table.csv')).toBe(true);
  });

  it('hides an htmlOutput map component as report material when a report is produced', () => {
    const { artifacts } = runHandler({
      outputSelection: richHtml,
      toolCalls: [
        { id: 'write', type: 'function', function: { name: 'write_output_file', arguments: '{"path":"/output/report.json"}' } },
      ],
      toolExecutionResults: [specResult(), htmlResult(richHtmlString)],
    });

    // The htmlOutputs path (not just dataOutputs) must demote HTML to hidden backing.
    expect(visibleArtifacts(artifacts).map((a) => a.type)).toEqual(['analysis_artifact_spec']);
    expect(reportMaterials(artifacts).some((a) => a.type === 'html')).toBe(true);
  });

});

describe('handleStreamCompleted persistence + validation', () => {
  function runHandler(
    event: StreamCompletedEventData,
  ): { actions: AnalyzeAction[]; artifacts: Artifact[] } {
    const artifacts: Artifact[] = [];
    const actions: AnalyzeAction[] = [];
    const messages: Message[] = [
      { id: event.messageId, sender: 'AI', senderType: 'ai', content: '', timestamp: 1 },
    ];
    handleStreamCompleted(event as unknown as Record<string, unknown>, {
      dispatch: (action) => {
        actions.push(action);
        if (action.type === 'ADD_ARTIFACT') artifacts.push(action.payload);
      },
      getState: () => ({
        artifacts,
        outputSelection: {
          ...createDefaultAnalyzeOutputSelection(),
          mode: 'rich',
          rich: { type: 'single_page_html', documentPreset: 'general_report', packages: [] },
        },
        currentSession: { id: 'session-1' },
        messages,
      }),
      now: () => Date.now(),
      persistMessage: jest.fn(),
      getFetchProvenanceMap: () => new Map(),
      setFetchProvenanceMap: jest.fn(),
      setLatestCompletedOperatorMessageId: jest.fn(),
      getSessionWorkbookManager: () => ({
        initialized: true,
        reset: jest.fn(),
        addDataTab: jest.fn(),
      }) as unknown as ReturnType<StreamCompletedDeps['getSessionWorkbookManager']>,
    });
    return { actions, artifacts };
  }

  const addArtifacts = (actions: AnalyzeAction[]): Artifact[] =>
    actions
      .filter((action) => action.type === 'ADD_ARTIFACT')
      .map((action) => (action as Extract<AnalyzeAction, { type: 'ADD_ARTIFACT' }>).payload);

  it('flags empty HTML output with a validationReport but still persists it (#7)', () => {
    const { actions } = runHandler({
      messageId: 'ai-val',
      finalContent: 'Done',
      toolCalls: [
        {
          id: 'call-val',
          type: 'function',
          function: { name: 'write_output_file', arguments: '{"path":"/output/empty.html"}' },
        },
      ],
      toolExecutionResults: [
        {
          toolName: 'write_output_file',
          success: true,
          htmlOutputs: [{ content: '   ', filename: 'empty.html' }],
        },
      ],
    });

    const htmlArtifacts = addArtifacts(actions).filter((a) => a.type === 'html');
    expect(htmlArtifacts.length).toBeGreaterThan(0);
    expect(htmlArtifacts[0].metadata?.validationReport?.valid).toBe(false);

    // The malformed artifact is flagged but NOT dropped: ADD_ARTIFACT is the
    // server's persistence (captureRound writes every collected artifact).
  });
});

describe('sanitizeToolExecutionResultsForPersistence', () => {
  // A Salesforce audit duplicated ~63MB of dataOutputs base64 + fullStdout into
  // one message's metadata, exceeding the 25MB cloud payload cap → the whole
  // message failed to sync (2026-07-24 live failure).
  it('strips base64 payloads and caps oversized content while keeping filenames, sizes, images, and html', () => {
    const hugeContent = 'z'.repeat(600 * 1024);
    const results: StreamCompletedEventData['toolExecutionResults'] = [{
      toolName: 'salesforce_metadata_audit',
      success: true,
      content: hugeContent,
      dataOutputs: [
        { filename: 'salesforce-component-index.json', base64: 'x'.repeat(50_000), size: 50_000 },
        { filename: 'salesforce-dependency-map.json', base64: 'y'.repeat(50_000), size: 50_000 },
      ],
      images: [{ mimeType: 'image/png', base64: 'imgpayload' }],
      htmlOutputs: [{ content: '<div>chart</div>', filename: 'chart.html' }],
    }];

    const sanitized = sanitizeToolExecutionResultsForPersistence(results)!;

    expect(sanitized[0].dataOutputs).toEqual([
      { filename: 'salesforce-component-index.json', base64: '', size: 50_000 },
      { filename: 'salesforce-dependency-map.json', base64: '', size: 50_000 },
    ]);
    expect(sanitized[0].content!.length).toBeLessThan(hugeContent.length);
    expect(sanitized[0].content).toContain('truncated for storage');
    // Restored transcripts re-render these — they must survive.
    expect(sanitized[0].images).toEqual([{ mimeType: 'image/png', base64: 'imgpayload' }]);
    expect(sanitized[0].htmlOutputs).toEqual([{ content: '<div>chart</div>', filename: 'chart.html' }]);
    // Original untouched (live session keeps full payloads).
    expect(results![0].dataOutputs![0].base64.length).toBe(50_000);
    expect(results![0].content!.length).toBe(600 * 1024);
  });

  it('passes through undefined and payload-free results unchanged', () => {
    expect(sanitizeToolExecutionResultsForPersistence(undefined)).toBeUndefined();
    const plain: StreamCompletedEventData['toolExecutionResults'] = [{
      toolName: 'web_search', success: true, content: 'results',
    }];
    expect(sanitizeToolExecutionResultsForPersistence(plain)).toEqual(plain);
  });
});
