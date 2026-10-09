/**
 * execute_python. Ported from symposium-ai-web
 * src/services/analyze/orchestrator/tools/executePythonTool.ts (Phase 3),
 * logic unchanged; the sandbox bridge is the server one.
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import type { SandboxBridge } from '../sandboxBridge';

interface MisplacedToolSyntax {
  lineNumber: number;
  line: string;
}

function isCompactedHistoryPlaceholder(code: string): boolean {
  return /execute_python code omitted from history/i.test(code);
}

function detectMisplacedToolSyntax(code: string): MisplacedToolSyntax | null {
  const lines = code.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Provider/tool-protocol directive accidentally placed inside Python code.
    if (/^call:[a-z0-9_-]+\/[a-z0-9_-]+\s*\{/i.test(trimmed)) {
      return {
        lineNumber: i + 1,
        line: rawLine,
      };
    }

    // Direct tool invocation syntax is not valid in execute_python context.
    if (/^(web_search|fetch_url|fetch_api|read_file|execute_python|salesforce_metadata_audit|salesforce_read_source|salesforce_docs_lookup|write_output_file|assemble_html_bundle)\s*\(/.test(trimmed)) {
      return {
        lineNumber: i + 1,
        line: rawLine,
      };
    }
  }

  return null;
}

function formatOutputPath(filename: string): string {
  return filename.startsWith('/output/') ? filename : `/output/${filename}`;
}

export async function executePythonTool(
  sandbox: SandboxBridge,
  toolCallId: string,
  code: string,
  signal: AbortSignal | undefined,
): Promise<ToolResult> {
  if (!code) {
    return { toolCallId, success: false, error: 'No code provided' };
  }

  if (isCompactedHistoryPlaceholder(code)) {
    const error = 'Invalid execute_python payload: this is a compacted conversation-history placeholder, not runnable Python. Use the paired tool result, read saved files with read_file, or reconstruct a fresh script instead of replaying omitted code.';

    return {
      toolCallId,
      success: false,
      content: `Error: ${error}`,
      error,
      metadata: { fullStdout: '' },
    };
  }

  const misplacedToolSyntax = detectMisplacedToolSyntax(code);
  if (misplacedToolSyntax) {
    const linePreview = misplacedToolSyntax.line.trim().slice(0, 180);
    const error = `Invalid execute_python code on line ${misplacedToolSyntax.lineNumber}: tool invocation syntax detected ("${linePreview}"). Call fetch_api/fetch_url/web_search/read_file/salesforce_metadata_audit/salesforce_docs_lookup/write_output_file as separate tool calls, then process their outputs in Python.`;

    return {
      toolCallId,
      success: false,
      content: `Error: ${error}`,
      error,
      metadata: { fullStdout: '' },
    };
  }

  const result = await sandbox.execute(code, {
    timeout: 60000,
    signal,
  });

  const hasOutput = !!(result.stdout && result.stdout.trim());
  const hasImages = !!(result.images && result.images.length > 0);
  const hasHtmlOutputs = !!(result.htmlOutputs && result.htmlOutputs.length > 0);
  const hasDataOutputs = !!(result.dataOutputs && result.dataOutputs.length > 0);

  let summaryForAI: string;
  if (result.error) {
    summaryForAI = `Error: ${result.error}`;
  } else if (hasHtmlOutputs && hasImages) {
    summaryForAI = `Executed successfully. Generated ${result.images!.length} static visualization(s) and ${result.htmlOutputs!.length} interactive visualization(s).`;
  } else if (hasHtmlOutputs) {
    summaryForAI = `Executed successfully. Generated ${result.htmlOutputs!.length} interactive visualization(s) saved to /output/.`;
  } else if (hasImages) {
    summaryForAI = `Executed successfully. Generated ${result.images!.length} visualization(s).`;
  } else if (hasOutput) {
    summaryForAI = 'Executed successfully.';
  } else {
    summaryForAI = 'Executed successfully (no output).';
  }

  if (hasOutput && !result.error) {
    // Full stdout — the model must see what it printed (dataframes, describe(),
    // computed values, verification output) to build on it instead of rebuilding
    // blind. No arbitrary 500-char clip; pruneHistoryIfNeeded governs total size.
    summaryForAI += `\nOutput:\n${result.stdout}`;
  }

  if (hasDataOutputs) {
    const fileList = result.dataOutputs!.map(d => formatOutputPath(d.filename)).join(', ');
    summaryForAI += ` Generated output file(s) retained for final synthesis: ${fileList}. Do not regenerate these files solely because binary/file contents are not shown in conversation history.`;
  } else if (hasImages && !result.error) {
    summaryForAI += ' The visualization artifact(s) were captured by the app for final synthesis; do not rerun solely because binary image data is not shown in conversation history.';
  }

  const fullStdout = result.stdout || '';
  const images = result.images?.map(img => ({ mimeType: 'image/png', base64: img }));
  const htmlOutputs = result.htmlOutputs;
  const dataOutputs = result.dataOutputs;

  if (result.error) {
    return {
      toolCallId,
      success: false,
      content: summaryForAI,
      error: result.error,
      images,
      htmlOutputs,
      dataOutputs,
      metadata: { fullStdout },
    };
  }

  return {
    toolCallId,
    success: true,
    content: summaryForAI,
    images,
    htmlOutputs,
    dataOutputs,
    metadata: { fullStdout },
  };
}
