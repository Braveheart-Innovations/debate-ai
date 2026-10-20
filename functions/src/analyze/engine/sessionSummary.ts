/**
 * History's summary of an Analyze session: the conversation doc's
 * lastMessageAt, messageCount and lastMessagePreview. The server writes them
 * when a turn starts and ends, when a review ends, and when a watch's run finds
 * new data, so a turn that ends with no tab open, or a watch run, moves the
 * session in History (web docs/analyze-beyond-reports-plan.md, groundwork
 * item 3). The web leaves them alone for Analyze sessions.
 *
 * They follow the web's rules: every message counts; the time is the newest
 * message's; the preview is the newest user or AI message with text (never a
 * tool result), its whitespace collapsed, cut to 200 characters.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { Message } from '../contract/types';
import { PAYLOAD_SENTINEL } from '../../cloudPayloadStorage';
import { hydratePayloadRefs } from './sessionStore';

const PREVIEW_LENGTH = 200;

export interface SessionSummary {
  lastMessageAt: number;
  messageCount: number;
  /** Absent when no message has text: the doc keeps the preview it had. */
  lastMessagePreview?: string;
}

type SummaryMessage = Pick<Message, 'senderType' | 'content' | 'timestamp'>;

/** As the web's ChatHistoryService.normalizePreview. */
export function normalizePreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);
}

/** The message a preview shows: the newest user or AI message with text. */
function previewMessage<T extends SummaryMessage>(messages: T[]): T | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.senderType !== 'tool' && typeof message.content === 'string' && message.content.trim()) return message;
  }
  return undefined;
}

/** The summary of a session's messages, oldest first; null when it has none. */
export function summarizeMessages(messages: SummaryMessage[]): SessionSummary | null {
  const last = messages[messages.length - 1];
  if (!last) return null;
  const preview = previewMessage(messages);
  return {
    lastMessageAt: last.timestamp,
    messageCount: messages.length,
    ...(preview ? { lastMessagePreview: normalizePreview(preview.content) } : {}),
  };
}

/** The session's doc: History's record of it, which the web creates. */
export function sessionDoc(uid: string, sessionId: string) {
  return getFirestore().doc(`users/${uid}/conversations/${sessionId}`);
}

/** Update the session's doc, unless it's gone: a deleted session isn't brought back. */
async function updateSession(uid: string, sessionId: string, fields: Partial<SessionSummary>): Promise<void> {
  try {
    await sessionDoc(uid, sessionId).update(fields);
  } catch (error) {
    if ((error as { code?: number }).code === 5) return; // NOT_FOUND
    throw error;
  }
}

/** Write the session's summary from its messages. */
export async function writeSessionSummary(uid: string, sessionId: string): Promise<void> {
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/messages`)
    .orderBy('timestamp', 'asc')
    .select('senderType', 'content', 'timestamp', 'payloadRefs')
    .get();
  const records = snapshot.docs.map((doc) => ({ ...(doc.data() as SummaryMessage & Record<string, unknown>), id: doc.id }));
  // A long reply's text is in Storage.
  const preview = previewMessage(records);
  if (preview?.content === PAYLOAD_SENTINEL) await hydratePayloadRefs(preview);
  if (preview?.content === PAYLOAD_SENTINEL) preview.content = '';
  const summary = summarizeMessages(records);
  if (summary) await updateSession(uid, sessionId, summary);
}

/**
 * A turn's start, written in the transaction that saves the user's message:
 * it's the newest message, one more, and its text is the preview. The turn's
 * end counts them all again.
 */
export function turnStartSummary(message: SummaryMessage): Record<string, unknown> {
  return {
    lastMessageAt: message.timestamp,
    messageCount: FieldValue.increment(1),
    ...(typeof message.content === 'string' && message.content.trim() ? { lastMessagePreview: normalizePreview(message.content) } : {}),
  };
}

/** A watch's run that saved a scenario: the session moves up, with what happened as its preview. */
export async function markSessionWatched(uid: string, sessionId: string, at: number, preview: string): Promise<void> {
  await updateSession(uid, sessionId, { lastMessageAt: at, lastMessagePreview: normalizePreview(preview) });
}
