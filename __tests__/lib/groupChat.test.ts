import { buildGroupTurnPrompt, stripLeadingSelfLabel } from '@/lib/groupChat';

describe('buildGroupTurnPrompt', () => {
  const responderNames = ['Gemini', 'ChatGPT', 'Claude'];

  it('gives the first responder the question and names who follows', () => {
    const prompt = buildGroupTurnPrompt({ userMessage: 'Q?', roundReplies: [], selfName: 'Gemini', responderNames });
    expect(prompt).toBe(
      "[User] Q?\n\n(Your turn, Gemini: you're replying first; ChatGPT and Claude will reply after you. Answer the user directly.)"
    );
  });

  it('gives later responders the full labeled round and their position', () => {
    const prompt = buildGroupTurnPrompt({
      userMessage: 'Q?',
      roundReplies: [
        { sender: 'Gemini', content: 'A' },
        { sender: 'ChatGPT', content: 'Gemini is wrong about A.' },
      ],
      selfName: 'Claude',
      responderNames,
    });
    expect(prompt).toBe(
      "[User] Q?\n\n[Gemini] A\n\n[ChatGPT] Gemini is wrong about A.\n\n(Your turn, Claude: you're replying 3rd of 3, after Gemini and ChatGPT. Answer the user, engaging with the earlier replies where useful.)"
    );
  });

  it('reflects a mention-limited round', () => {
    const prompt = buildGroupTurnPrompt({ userMessage: 'Q?', roundReplies: [], selfName: 'Claude', responderNames: ['Claude'] });
    expect(prompt).toBe('[User] Q?\n\n(Your turn, Claude. Answer the user directly.)');
  });

  it('only counts successful earlier replies as "after"', () => {
    const prompt = buildGroupTurnPrompt({
      userMessage: 'Q?',
      roundReplies: [{ sender: 'ChatGPT', content: 'B' }],
      selfName: 'Claude',
      responderNames,
    });
    expect(prompt).toContain("you're replying 3rd of 3, after ChatGPT.");
  });
});

describe('stripLeadingSelfLabel', () => {
  it.each([
    ['[Claude] Hello', 'Hello'],
    ['Claude: Hello', 'Hello'],
    ['**Claude**: Hello', 'Hello'],
    ['[Claude]\nHello', 'Hello'],
  ])('strips %j', (input, expected) => {
    expect(stripLeadingSelfLabel(input, 'Claude')).toBe(expected);
  });

  it("leaves other speakers' names and mid-text mentions alone", () => {
    expect(stripLeadingSelfLabel('Gemini: said X', 'Claude')).toBe('Gemini: said X');
    expect(stripLeadingSelfLabel('I agree with Claude: yes', 'Claude')).toBe('I agree with Claude: yes');
  });
});
