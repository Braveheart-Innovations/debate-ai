/**
 * Group-chat prompting for multi-AI Chat.
 *
 * In Chat, several AIs answer one user message in sequence. Each AI must know who it is,
 * who said what (see BaseAdapter.formatHistory speaker attribution), and how to engage
 * with the other participants. The contract below lives in the system prompt; the turn
 * prompt carries the current round's transcript plus a positional cue.
 */

export const USER_LABEL = 'User';

export const formatSpeakerLabel = (speaker: string, content: string): string =>
  `[${speaker}] ${content}`;

const listNames = (names: string[]): string => {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

export function buildGroupChatContract(options: { selfName: string; participants: string[] }): string {
  const { selfName, participants } = options;
  const roster = participants
    .map(name => (name === selfName ? `${name} (you)` : name))
    .join(', ');

  return [
    `You appear in this group chat as ${selfName}, one of several AI participants talking with a user. Participants: ${roster}. Each round, the AIs reply one at a time in a set order, and each sees everything said before its turn. If a persona is described above, speak in its voice; your transcript label is still ${selfName}.`,
    '',
    `Reading the transcript: [${USER_LABEL}] is the human. [Name] marks another participant's message. Only your own earlier replies appear unlabeled as assistant turns. Never take credit or blame for another participant's words — a critique aimed at another AI is not aimed at you.`,
    '',
    'Contributing:',
    "- Serve the user's question first.",
    '- Build on earlier replies instead of repeating them. If you agree, say so briefly and add something new. When you engage a specific point, name whose it is (e.g. "Gemini\'s point about X…"). Synthesize where views converge.',
    '- Accuracy over agreement. If anyone — another AI or the user — states something false or unsupported, say so plainly, explain why, and give the correct information. Do not let errors stand to be polite. If you are unsure, say so. If someone correctly flags an error you made, own it.',
    '- Keep it conversational, collaborative, and generous. Challenge claims, not participants. No point-scoring.',
    '- Do not prefix your reply with your name or a bracketed label.',
  ].join('\n');
}

export interface GroupTurnReply {
  sender: string;
  content: string;
}

export function buildGroupTurnPrompt(options: {
  userMessage: string;
  roundReplies: GroupTurnReply[];
  selfName: string;
  responderNames: string[];
}): string {
  const { userMessage, roundReplies, selfName, responderNames } = options;
  const total = Math.max(responderNames.length, 1);
  const index = responderNames.indexOf(selfName);
  const position = index >= 0 ? index + 1 : roundReplies.length + 1;
  const before = roundReplies.map(reply => reply.sender);
  const after = index >= 0 ? responderNames.slice(index + 1) : [];

  const transcript = [
    formatSpeakerLabel(USER_LABEL, userMessage),
    ...roundReplies.map(reply => formatSpeakerLabel(reply.sender, reply.content)),
  ].join('\n\n');

  let cue: string;
  if (before.length === 0) {
    cue = after.length > 0
      ? `(Your turn, ${selfName}: you're replying first; ${listNames(after)} will reply after you. Answer the user directly.)`
      : `(Your turn, ${selfName}. Answer the user directly.)`;
  } else {
    cue = `(Your turn, ${selfName}: you're replying ${ordinal(position)} of ${total}, after ${listNames(before)}. Answer the user, engaging with the earlier replies where useful.)`;
  }

  return `${transcript}\n\n${cue}`;
}

/**
 * Models occasionally echo the transcript format and open with their own label
 * ("[Claude] …" or "Claude: …"). Strip a single leading self-label.
 */
export function stripLeadingSelfLabel(content: string, selfName: string): string {
  if (!content || !selfName) return content;
  const escaped = selfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:\\[${escaped}\\]|\\*\\*${escaped}\\*\\*:|${escaped}:)[ \\t]*\\n?`, 'i');
  return content.replace(pattern, '');
}
