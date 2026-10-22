/**
 * Guides on demand (symposium-ai-web docs/analyze-context-design.md, "Auto:
 * guides on demand"). The prompt carries a short menu; the full how-to for each
 * kind of output (a report, a model, a diagram, a Salesforce job) is a guide the
 * model reads with `read_guide` when it decides to make that output. The guide
 * lands in the history once and is cached after that. The web builds the guide
 * texts and sends them with the turn (RunConfig.guides) until the server builds
 * the prompts itself (v3 Step 3).
 */
import type { ToolDefinition } from '../contract/lib/ai/tools/types';

export const READ_GUIDE_TOOL_NAME = 'read_guide';

const GUIDE_NAME = /^[a-z][a-z0-9_]*$/;

/** The turn's guides from the request: name → text. Anything else is ignored. */
export function parseGuides(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const guides: Record<string, string> = {};
  for (const [name, text] of Object.entries(value as Record<string, unknown>)) {
    if (GUIDE_NAME.test(name) && typeof text === 'string' && text.trim()) guides[name] = text;
  }
  return Object.keys(guides).length > 0 ? guides : undefined;
}

export function guideNames(guides: Record<string, string> | undefined): string[] {
  return Object.keys(guides ?? {}).sort();
}

export function buildReadGuideTool(names: string[]): ToolDefinition {
  return {
    name: READ_GUIDE_TOOL_NAME,
    description: 'Read the instructions for making one kind of output (a report, a model, a diagram, a Salesforce job), before you make it. Each guide is the full how-to for that output; read it once per session, since it stays in your context.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: names, description: 'The guide to read.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    category: 'compute',
    execution: 'orchestrator',
    requiresConfirmation: false,
  };
}

/** read_guide: the guide's text, or which guides there are. */
export function readGuide(guides: Record<string, string> | undefined, args: Record<string, unknown>): { success: boolean; content: string } {
  const name = typeof args.name === 'string' ? args.name : '';
  const text = guides?.[name];
  if (text) return { success: true, content: text };
  const names = guideNames(guides);
  return {
    success: false,
    content: names.length > 0
      ? `There is no guide "${name}". The guides are: ${names.join(', ')}.`
      : 'This session has no guides.',
  };
}

/** The line a save check adds when the run has the guide for what it rejected. */
export function guideHint(guides: Record<string, string> | undefined, name: string): string {
  return guides?.[name] ? ` The how-to is in read_guide("${name}").` : '';
}
