import JSZip from 'jszip';

import { executeSalesforceMetadataAuditTool } from '../executeSalesforceMetadataAuditTool';

// The sandbox filesystem is injected on the server (the browser mocked the sandboxService singleton).
const mockSandboxService = {
  listFiles: jest.fn(),
  readFile: jest.fn(),
  mountFile: jest.fn(),
};

function decodeBuffer(data: ArrayBuffer): string {
  return new TextDecoder().decode(data);
}

describe('executeSalesforceMetadataAuditTool', () => {
  beforeEach(() => {
    mockSandboxService.listFiles.mockReset();
    mockSandboxService.readFile.mockReset();
    mockSandboxService.mountFile.mockReset();
    mockSandboxService.mountFile.mockImplementation(async (_filename: string, _data: ArrayBuffer, path: string) => path);
  });

  it('writes generated Salesforce artifacts to deterministic filesystem paths for follow-up Python analysis', async () => {
    const manifest = {
      version: 1,
      kind: 'salesforce_insight_packet',
      createdAt: '2026-05-07T19:01:45Z',
      source: {
        workspaceName: 'Salesforce/QA',
        gitBranch: 'main',
        gitCommit: null,
      },
      agentSession: {
        agent: 'claude_code',
        toolsUsed: ['salesforce_mcp', 'static_analysis'],
      },
      goals: ['Render stakeholder findings'],
      files: {
        findings: 'findings.json',
        evidence: 'evidence.md',
        transcript: 'transcript.md',
      },
    };
    const findings = {
      findings: [
        {
          id: 'sf-token-risk',
          title: 'Token field is not constrained',
          severity: 'medium',
          audienceImpact: 'security',
          summary: 'The public token lookup has no unique or external-id constraint.',
          affectedPaths: ['force-app/main/default/classes/CaseService.cls'],
          affectedComponents: ['CaseService'],
          evidenceRefs: ['evidence.md#sf-token-risk'],
          recommendedNextStep: 'Review the token lookup path before implementation.',
          confidence: 0.8,
        },
      ],
    };
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/manifest.json', JSON.stringify(manifest));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/findings.json', JSON.stringify(findings));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/evidence.md', '# Evidence\n<a id="sf-token-risk"></a>');
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/transcript.md', 'Transcript');

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-1', {
      operation: 'audit',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Static metadata signals requiring docs/AI review:');
    expect(result.content).toContain('Salesforce documentation lookup topics generated:');
    expect(result.content).toContain('Imported agent evidence from .symposium packets: 1');
    expect(result.content).toContain('top-level `importedFindings` key');
    expect(result.content).toContain('/output/salesforce/artifact-manifest.json');
    expect(result.content).toContain('/output/salesforce/salesforce-insight-packets.json');
    expect(result.content).toContain('/output/salesforce/salesforce-artifact-schema.json');
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual(
      expect.arrayContaining([
        'artifact-manifest.json',
        'salesforce-component-index.json',
        'salesforce-insight-packets.json',
        'salesforce-workbench-summary.json',
        'salesforce-signal-evidence.json',
        'salesforce-doc-topics.json',
        'salesforce-artifact-schema.json',
        'salesforce-stakeholder-visual-artifacts.json',
      ])
    );

    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce-insight-packets.json',
      expect.anything(),
      '/output/salesforce/salesforce-insight-packets.json',
    );
    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce-insight-packets.json',
      expect.anything(),
      '/data/salesforce/salesforce-insight-packets.json',
    );
    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce_insight_packet_summary.json',
      expect.anything(),
      '/data/salesforce_insight_packet_summary.json',
    );
    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce_artifact_schema.json',
      expect.anything(),
      '/data/salesforce_artifact_schema.json',
    );
    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce_doc_topics.json',
      expect.anything(),
      '/data/salesforce_doc_topics.json',
    );
    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce_signal_evidence.json',
      expect.anything(),
      '/data/salesforce_signal_evidence.json',
    );
    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce_workbench_summary.json',
      expect.anything(),
      '/data/salesforce_workbench_summary.json',
    );

    const insightPacketWrite = mockSandboxService.mountFile.mock.calls.find((call) =>
      call[2] === '/output/salesforce/salesforce-insight-packets.json'
    );
    expect(insightPacketWrite).toBeDefined();
    expect(JSON.parse(decodeBuffer(insightPacketWrite![1]))).toMatchObject({
      schema: {
        keyPaths: {
          importedFindings: 'importedFindings[]',
          matchedComponents: 'importedFindings[].matchedComponents[]',
        },
      },
      importedFindings: [
        expect.objectContaining({
          id: 'sf-token-risk',
          matchedComponents: [
            expect.objectContaining({ name: 'CaseService' }),
          ],
        }),
      ],
    });

    const manifestWrite = mockSandboxService.mountFile.mock.calls.find((call) =>
      call[2] === '/output/salesforce/artifact-manifest.json'
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(decodeBuffer(manifestWrite![1]))).toMatchObject({
      outputRoot: '/output/salesforce',
      dataRoot: '/data/salesforce',
      files: expect.arrayContaining([
        expect.objectContaining({
          filename: 'salesforce-insight-packets.json',
          outputPath: '/output/salesforce/salesforce-insight-packets.json',
          dataPath: '/data/salesforce/salesforce-insight-packets.json',
          aliases: ['/output/salesforce-insight-packets.json', '/data/salesforce_insight_packet_summary.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-artifact-schema.json',
          outputPath: '/output/salesforce/salesforce-artifact-schema.json',
          dataPath: '/data/salesforce/salesforce-artifact-schema.json',
          aliases: ['/output/salesforce-artifact-schema.json', '/data/salesforce_artifact_schema.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-doc-topics.json',
          outputPath: '/output/salesforce/salesforce-doc-topics.json',
          dataPath: '/data/salesforce/salesforce-doc-topics.json',
          aliases: ['/output/salesforce-doc-topics.json', '/data/salesforce_doc_topics.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-signal-evidence.json',
          outputPath: '/output/salesforce/salesforce-signal-evidence.json',
          dataPath: '/data/salesforce/salesforce-signal-evidence.json',
          aliases: ['/output/salesforce-signal-evidence.json', '/data/salesforce_signal_evidence.json'],
        }),
        expect.objectContaining({
          filename: 'salesforce-workbench-summary.json',
          outputPath: '/output/salesforce/salesforce-workbench-summary.json',
          dataPath: '/data/salesforce/salesforce-workbench-summary.json',
          aliases: ['/output/salesforce-workbench-summary.json', '/data/salesforce_workbench_summary.json'],
        }),
      ]),
    });
  });

  it('supports packet_findings as a direct operation for imported agent evidence', async () => {
    const manifest = {
      version: 1,
      kind: 'salesforce_insight_packet',
      createdAt: '2026-05-07T19:01:45Z',
      source: {
        workspaceName: 'Salesforce/QA',
        gitBranch: '',
        gitCommit: null,
      },
      agentSession: {
        agent: 'claude_code',
        toolsUsed: ['salesforce_mcp', 'static_analysis'],
      },
      goals: ['Render stakeholder findings'],
      files: {
        findings: 'findings.json',
        evidence: 'evidence.md',
      },
    };
    const findings = {
      findings: [
        {
          id: 'sf-token-risk',
          title: 'Token field is not constrained',
          severity: 'medium',
          audienceImpact: 'security',
          summary: 'The public token lookup has no unique or external-id constraint.',
          affectedPaths: ['force-app/main/default/classes/CaseService.cls'],
          affectedComponents: ['CaseService'],
          evidenceRefs: ['evidence.md#sf-token-risk'],
          recommendedNextStep: 'Review the token lookup path before implementation.',
          confidence: 0.8,
        },
      ],
    };
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/manifest.json', JSON.stringify(manifest));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/findings.json', JSON.stringify(findings));
    zip.file('.symposium/salesforce-insights/20260507T190145Z-qa-source-audit/evidence.md', '# Evidence\n<a id="sf-token-risk"></a>');

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-2', {
      operation: 'packet_findings',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Agent insight packets detected: 1');
    expect(result.content).toContain('Imported agent evidence from .symposium packets: 1');
    expect(result.content).toContain('Invalid insight packets / validation warnings: 0');
    expect(result.content).toContain('sf-token-risk: Token field is not constrained');
    expect(result.content).toContain('/output/salesforce/salesforce-insight-packets.json');
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual(
      expect.arrayContaining([
        'artifact-manifest.json',
        'salesforce-insight-packets.json',
        'salesforce-doc-topics.json',
        'salesforce-artifact-schema.json',
      ])
    );

    const insightPacketWrite = mockSandboxService.mountFile.mock.calls.find((call) =>
      call[2] === '/output/salesforce/salesforce-insight-packets.json'
    );
    expect(insightPacketWrite).toBeDefined();
    const summary = JSON.parse(decodeBuffer(insightPacketWrite![1]));
    expect(summary.validPackets[0].warnings).toEqual([
      'source.gitBranch is missing or empty; imported with gitBranch set to "unknown".',
    ]);
    expect(summary.importedFindings[0]).toMatchObject({
      id: 'sf-token-risk',
      matchedComponentNames: ['CaseService'],
    });
  });

  it('embeds the org-evidence decision instruction in the tool result when no packets are imported', async () => {
    // Two live runs finalized reports with an "org runtime evidence: none was
    // supplied" caveat without raising the request card — the system-prompt
    // rule alone loses under reasoning_effort 'none'. The instruction must sit
    // in the tool result at the decision moment.
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-org-evidence-note', {
      operation: 'audit',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('ORG EVIDENCE DECISION (read now)');
    expect(result.content).toContain('MUST call request_salesforce_org_evidence BEFORE writing the report');
  });

  it('carries the lens synthesis guidance + report-type hint for the chosen operation', async () => {
    // Auto mode: the operation choice IS the lens choice — the tool result
    // must carry the lens's synthesis framing so Auto isn't lighter-touch
    // than pinning (asymmetry closed 2026-07-24).
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    const bundle = await zip.generateAsync({ type: 'arraybuffer' });
    mockSandboxService.readFile.mockResolvedValue(bundle);

    const audit = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-synth-audit', {
      operation: 'audit',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });
    expect(audit.content).toContain('Synthesis guidance (Workspace Audit path)');
    expect(audit.content).toContain('`source_grounded_audit`');

    mockSandboxService.readFile.mockResolvedValue(bundle);
    const readiness = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-synth-release', {
      operation: 'feature_readiness',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
      query: 'Winter release go-live readiness for the Creme rollout',
    });
    expect(readiness.content).toContain('Synthesis guidance (Release Readiness path)');
    expect(readiness.content).toContain('`executive_brief`');
  });

  it('supports troubleshooting as a direct operation for pasted Flow and Apex errors', async () => {
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', `
public without sharing class CaseService {
  public static void escalate(List<Case> casesToProcess) {
    for (Case c : casesToProcess) {
      update c;
    }
  }
}
`);
    zip.file('force-app/main/default/flows/Case_Escalation.flow-meta.xml', `
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <status>Active</status>
  <processType>AutoLaunchedFlow</processType>
  <recordUpdates>
    <name>Update_Case</name>
    <object>Case</object>
  </recordUpdates>
</Flow>
`);

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-troubleshooting', {
      operation: 'troubleshooting',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
      query: 'FLOW_ELEMENT_ERROR in Case_Escalation. System.DmlException at Class.CaseService: line 4. End users cannot escalate Cases in production.',
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('# Salesforce Troubleshooting Brief');
    expect(result.content).toContain('CaseService');
    expect(result.content).toContain('Case_Escalation');
    expect(result.content).toContain('Read-Only Diagnostic Path');
    expect(result.content).toContain('/output/salesforce/salesforce-troubleshooting-brief.md');
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual(
      expect.arrayContaining([
        'artifact-manifest.json',
        'salesforce-troubleshooting-brief.md',
        'salesforce-component-index.json',
        'salesforce-dependency-map.json',
        'salesforce-remediation-backlog.json',
        'salesforce-signal-evidence.json',
        'salesforce-workbench-summary.json',
        'salesforce-doc-topics.json',
      ])
    );

    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce-troubleshooting-brief.md',
      expect.anything(),
      '/output/salesforce/salesforce-troubleshooting-brief.md',
    );
    expect(mockSandboxService.mountFile).toHaveBeenCalledWith(
      'salesforce_troubleshooting_brief.md',
      expect.anything(),
      '/data/salesforce_troubleshooting_brief.md',
    );
  });

  it('reports invalid insight packets through packet_findings without manual ZIP parsing', async () => {
    const zip = new JSZip();
    zip.file('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    zip.file('force-app/main/default/classes/CaseService.cls', 'public with sharing class CaseService {}');
    zip.file('.symposium/salesforce-insights/bad-run/manifest.json', JSON.stringify({
      version: 1,
      kind: 'bad_packet',
      createdAt: '2026-05-07T19:01:45Z',
      source: { workspaceName: 'Salesforce/QA', gitBranch: 'main', gitCommit: null },
      agentSession: { agent: 'claude_code', toolsUsed: ['salesforce_mcp'] },
      goals: ['Render stakeholder findings'],
      files: { findings: 'findings.json', evidence: 'evidence.md' },
    }));
    zip.file('.symposium/salesforce-insights/bad-run/findings.json', JSON.stringify({ findings: [] }));
    zip.file('.symposium/salesforce-insights/bad-run/evidence.md', '# Evidence');

    mockSandboxService.readFile.mockResolvedValue(await zip.generateAsync({ type: 'arraybuffer' }));

    const result = await executeSalesforceMetadataAuditTool(mockSandboxService, 'call-3', {
      operation: 'packet_findings',
      paths: ['/uploads/QA-salesforce-metadata.zip'],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Agent insight packets detected: 0');
    expect(result.content).toContain('Imported agent evidence from .symposium packets: 0');
    expect(result.content).toContain('Invalid insight packets / validation warnings: 1');

    const insightPacketWrite = mockSandboxService.mountFile.mock.calls.find((call) =>
      call[2] === '/output/salesforce/salesforce-insight-packets.json'
    );
    expect(insightPacketWrite).toBeDefined();
    const summary = JSON.parse(decodeBuffer(insightPacketWrite![1]));
    expect(summary.invalidPackets[0]).toMatchObject({
      runId: 'bad-run',
      errors: expect.arrayContaining(['kind must be salesforce_insight_packet.']),
    });
  });
});
