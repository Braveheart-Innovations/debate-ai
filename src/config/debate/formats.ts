// Debate format specifications and shared types

export type DebateFormatId = 'oxford' | 'lincoln_douglas' | 'policy' | 'socratic';

export interface FormatPhase {
  id: 'opening' | 'rebuttal' | 'closing' | 'crossfire' | 'question';
  description: string;
}

export interface TurnSpec {
  phase: FormatPhase['id'];
  // index of the AI who speaks this turn (0 or 1 for 2‑AI debates)
  speakerIndex: number;
}

export interface FormatSpec {
  id: DebateFormatId;
  name: string;
  description: string;
  defaultRounds: number; // logical rounds of back‑and‑forth; UI caps to 1–5
  phases: FormatPhase[];
  // sequence for two participants; repeated/truncated according to selected rounds
  baseTurns: TurnSpec[];
  // default per‑phase guidance (non‑prescriptive)
  guidance: {
    opening: string;
    rebuttal: string;
    closing: string;
    crossfire?: string;
    question?: string;
  };
}

const opening = 'Opening: state your case clearly. No headings or lists.';
const rebuttal = 'Rebuttal: answer specific claims; maintain stance; no meta.';
const closing = 'Closing: reinforce strongest point; no new claims; concise.';

export const OXFORD_FORMAT: FormatSpec = {
  id: 'oxford',
  name: 'Oxford',
  description: 'Classic formal debate with structured arguments and clear positions',
  defaultRounds: 3,
  phases: [
    { id: 'opening', description: 'Opening argument' },
    { id: 'rebuttal', description: 'Rebuttal to opponent' },
    { id: 'closing', description: 'Closing statement' },
  ],
  // Support up to 7 exchanges (14 turns). Extended rebuttal cycles before closing.
  baseTurns: [
    // Exchange 1: Opening
    { phase: 'opening', speakerIndex: 0 },
    { phase: 'opening', speakerIndex: 1 },
    // Exchanges 2–6: Rebuttal cycles
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    // Exchange 7: Closing
    { phase: 'closing', speakerIndex: 0 },
    { phase: 'closing', speakerIndex: 1 },
  ],
  guidance: { opening, rebuttal, closing },
};

export const LINCOLN_DOUGLAS_FORMAT: FormatSpec = {
  id: 'lincoln_douglas',
  name: 'Lincoln–Douglas',
  description: 'Philosophical debate focusing on ethics, values, and moral principles',
  defaultRounds: 3,
  phases: [
    { id: 'opening', description: 'Value‑framed opening' },
    { id: 'rebuttal', description: 'Counterarguments' },
    { id: 'closing', description: 'Principled closing' },
  ],
  baseTurns: [
    // Exchange 1: Extended opening emphasis
    { phase: 'opening', speakerIndex: 0 },
    { phase: 'opening', speakerIndex: 1 },
    // Exchanges 2–6: Value-weighing rebuttals
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    // Exchange 7: Closing
    { phase: 'closing', speakerIndex: 0 },
    { phase: 'closing', speakerIndex: 1 },
  ],
  guidance: {
    opening: 'Opening: frame moral values and criteria; define key terms; no headings.',
    rebuttal: 'Rebuttal: weigh values explicitly; address criteria; natural prose.',
    closing,
  },
};

export const POLICY_FORMAT: FormatSpec = {
  id: 'policy',
  name: 'Policy',
  description: 'Data-driven debate with evidence, research, and practical solutions',
  defaultRounds: 3,
  phases: [
    { id: 'opening', description: 'Plan/counterplan' },
    { id: 'rebuttal', description: 'Line‑by‑line response' },
    { id: 'closing', description: 'Impact calculus and decision rule' },
  ],
  baseTurns: [
    // Exchange 1: Plans
    { phase: 'opening', speakerIndex: 0 },
    { phase: 'opening', speakerIndex: 1 },
    // Exchanges 2–6: Line-by-line rebuttal depth
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    // Exchange 7: Closing with impact calc
    { phase: 'closing', speakerIndex: 0 },
    { phase: 'closing', speakerIndex: 1 },
  ],
  guidance: {
    opening: 'Opening: present plan/counterplan with 1–2 key pieces of support; natural prose.',
    rebuttal: 'Rebuttal: address specific lines; cite selectively; no lists.',
    closing: 'Closing: weigh impacts; propose clear decision rule; concise.',
  },
};

export const SOCRATIC_FORMAT: FormatSpec = {
  id: 'socratic',
  name: 'Socratic',
  description: 'Inquiry-based dialogue that explores ideas through thoughtful questions',
  defaultRounds: 4,
  phases: [
    { id: 'opening', description: 'Initial framing as questions' },
    { id: 'rebuttal', description: 'Focused follow‑ups' },
    { id: 'closing', description: 'Concise synthesis' },
  ],
  baseTurns: [
    // Exchange 1: Opening questions
    { phase: 'opening', speakerIndex: 0 },
    { phase: 'opening', speakerIndex: 1 },
    // Exchanges 2–6: Short probing Q/A
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    { phase: 'rebuttal', speakerIndex: 0 },
    { phase: 'rebuttal', speakerIndex: 1 },
    // Exchange 7: Closing synthesis
    { phase: 'closing', speakerIndex: 0 },
    { phase: 'closing', speakerIndex: 1 },
  ],
  guidance: {
    opening: 'Opening: ask pointed questions to define terms and assumptions; brief.',
    rebuttal: 'Follow‑ups: ask or answer compactly; pressure test assumptions; no headings.',
    closing: 'Closing: one clear insight or synthesis; very concise.',
  },
};

export const FORMATS: Record<DebateFormatId, FormatSpec> = {
  oxford: OXFORD_FORMAT,
  lincoln_douglas: LINCOLN_DOUGLAS_FORMAT,
  policy: POLICY_FORMAT,
  socratic: SOCRATIC_FORMAT,
};

export function getFormat(id: DebateFormatId): FormatSpec {
  return FORMATS[id] || OXFORD_FORMAT;
}
