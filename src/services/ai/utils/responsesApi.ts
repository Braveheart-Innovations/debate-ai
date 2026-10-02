/**
 * Pure helpers for the OpenAI-style Responses API (`POST /v1/responses`),
 * shared by adapters whose providers mirror it (OpenAI, xAI).
 */

/** Named server-sent events the OpenAI-compatible Responses API streams. */
export const RESPONSES_STREAM_EVENTS = [
  'response.output_text.delta',
  'response.output_text.done',
  'response.completed',
  'response.incomplete',
  'response.delta',
  'response.error',
] as const;
export type ResponsesStreamEvent = (typeof RESPONSES_STREAM_EVENTS)[number];

export interface ResponsesCitation {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
}

export type ResponsesInputPart =
  | { type: 'input_text'; text: string }
  | { type: 'output_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; filename: string; file_data: string };

export interface ResponsesInputMessage {
  role: 'user' | 'assistant';
  content: ResponsesInputPart[];
}

interface ChatStylePart {
  type: string;
  text?: string;
  image_url?: { url: string };
  file?: { file_name: string; file_data: string };
}

export interface ChatStyleMessage {
  role: 'user' | 'assistant';
  content: string | ChatStylePart[];
}

/** Transform chat-completions-style messages into typed Responses input. */
export function buildResponsesInput(messages: ChatStyleMessage[]): ResponsesInputMessage[] {
  return messages.map((message) => {
    const isAssistant = message.role === 'assistant';

    if (typeof message.content === 'string') {
      return {
        role: message.role,
        content: [{ type: isAssistant ? 'output_text' : 'input_text', text: message.content } as ResponsesInputPart],
      };
    }

    const parts = message.content
      .map((part): ResponsesInputPart | undefined => {
        if (isAssistant) {
          if (part.type === 'text' && part.text) {
            return { type: 'output_text', text: part.text };
          }
          return undefined;
        }
        if (part.type === 'text' && part.text) {
          return { type: 'input_text', text: part.text };
        }
        if (part.type === 'image_url' && part.image_url) {
          return { type: 'input_image', image_url: part.image_url.url };
        }
        if (part.type === 'file' && part.file) {
          return { type: 'input_file', filename: part.file.file_name, file_data: part.file.file_data };
        }
        return undefined;
      })
      .filter((part): part is ResponsesInputPart => part !== undefined);

    return { role: message.role, content: parts };
  });
}

function pickText(node: Record<string, unknown> | null | undefined): string {
  if (!node) return '';
  const text = node.text;
  if (typeof text === 'string') return text;
  if (text && typeof text === 'object' && typeof (text as { value?: unknown }).value === 'string') {
    return (text as { value: string }).value;
  }
  return '';
}

/** Join output_text/refusal parts from a Responses payload (or its `response` wrapper). */
export function extractTextFromResponsesOutput(root: unknown): string {
  const response = (root as { response?: unknown } | undefined)?.response ?? root;
  const directOutputText = (response as { output_text?: unknown } | undefined)?.output_text;
  if (typeof directOutputText === 'string') {
    return directOutputText;
  }

  const output = (response as { output?: unknown } | undefined)?.output;
  if (!Array.isArray(output)) return '';

  const texts: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    const type = item?.type as string | undefined;
    if (type && (type.includes('output_text') || type.includes('refusal'))) {
      const itemText = pickText(item);
      if (itemText) texts.push(itemText);
    }

    const content = item?.content;
    if (Array.isArray(content)) {
      for (const part of content as Array<Record<string, unknown>>) {
        if (part?.type === 'output_text' || part?.type === 'refusal') {
          const partText = pickText(part);
          if (partText) texts.push(partText);
        }
      }
    }
  }

  return texts.join('');
}

/**
 * Some providers inline web-search citations as markdown links in the answer
 * text — Grok as double-bracketed numbers `[[1]](https://…)`, OpenAI as titled
 * links `[Source Title](https://…)`. The app renders inline citations from bare
 * `[n]` references plus matching metadata, so left as-is the link's `(url)` (or
 * a raw URL) leaks into the rendered text. Rewrite each inline link to a bare
 * `[n]` reference (renumbered sequentially, deduped by URL) and return the
 * citations so the inline chips and the source table line up. A non-numeric
 * link label is preserved as the citation title.
 */
export function normalizeInlineCitations(text: string): {
  text: string;
  citations: ResponsesCitation[];
} {
  const urlToIndex = new Map<string, number>();
  const citations: ResponsesCitation[] = [];
  const cleaned = text.replace(
    /\[+([^\]]+?)\]+\s*\((https?:\/\/[^)\s]+)\)/g,
    (_match, label: string, url: string) => {
      let index = urlToIndex.get(url);
      if (index === undefined) {
        index = citations.length + 1;
        urlToIndex.set(url, index);
        const title = /^\d+$/.test(label.trim()) ? undefined : label.trim();
        citations.push({ index, url, ...(title ? { title } : {}) });
      }
      return `[${index}]`;
    }
  );
  return { text: cleaned, citations };
}

function extractCitationsFromMarkdown(text: string): ResponsesCitation[] {
  const citations: ResponsesCitation[] = [];
  const seenUrls = new Set<string>();
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    const title = match[1];
    const url = match[2];
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      citations.push({ index: citations.length + 1, url, title });
    }
  }

  return citations;
}

/**
 * Collect citations from a Responses payload: url_citation annotations first,
 * then xAI's top-level `citations: string[]`, then markdown links in the text.
 */
export function extractResponsesCitations(root: unknown, responseText: string): ResponsesCitation[] {
  const citations: ResponsesCitation[] = [];
  const seenUrls = new Set<string>();

  const addCitation = (url: unknown, title?: unknown, snippet?: unknown) => {
    if (typeof url !== 'string' || !url || seenUrls.has(url)) return;
    seenUrls.add(url);
    citations.push({
      index: citations.length + 1,
      url,
      ...(typeof title === 'string' && title ? { title } : {}),
      ...(typeof snippet === 'string' && snippet ? { snippet } : {}),
    });
  };

  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    if (record.type === 'url_citation') {
      addCitation(record.url, record.title, record.snippet);
    }

    Object.values(record).forEach(visit);
  };

  visit(root);

  if (citations.length === 0) {
    const response = (root as { response?: unknown } | undefined)?.response ?? root;
    const topLevel = (response as { citations?: unknown } | undefined)?.citations;
    if (Array.isArray(topLevel)) {
      for (const url of topLevel) {
        addCitation(url);
      }
    }
  }

  if (citations.length === 0 && responseText) {
    return extractCitationsFromMarkdown(responseText);
  }

  return citations;
}
