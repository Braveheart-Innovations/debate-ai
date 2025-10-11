import { DEBATE_CONSTANTS } from '@/config/debateConstants';

describe('Debate constants', () => {
  it('generates context-aware system messages', () => {
    expect(DEBATE_CONSTANTS.MESSAGES.ROUND_START(2)).toBe('Exchange 2');
    expect(DEBATE_CONSTANTS.MESSAGES.FINAL_ROUND).toBe('Final Exchange');

    const startMessage = DEBATE_CONSTANTS.MESSAGES.DEBATE_START('Test Topic', 'Kai');
    expect(startMessage).toContain('"Test Topic"');
    expect(startMessage).toContain('Kai opens the debate.');

    expect(DEBATE_CONSTANTS.MESSAGES.ERROR('Claude')).toBe('Claude had an error. Continuing...');
  });

  it('produces voting prompts and markers', () => {
    expect(DEBATE_CONSTANTS.VOTING.ROUND_PROMPT(1)).toBe('🏅 Who won this exchange?');
    expect(DEBATE_CONSTANTS.VOTING.FINAL_ROUND_PROMPT).toBe('🏅 Who won the final exchange?');
    expect(DEBATE_CONSTANTS.PROMPT_MARKERS.DEBATE_MODE).toBe('[DEBATE MODE]');
    expect(DEBATE_CONSTANTS.PROMPT_MARKERS.FINAL_ARGUMENT).toBe('Make your final argument!');
  });

  it('maintains UI timing configuration', () => {
    expect(DEBATE_CONSTANTS.DELAYS.AI_RESPONSE).toBeGreaterThanOrEqual(0);
    expect(DEBATE_CONSTANTS.DELAYS.RATE_LIMIT_RECOVERY).toBeGreaterThan(DEBATE_CONSTANTS.DELAYS.AUTO_SCROLL);
    expect(DEBATE_CONSTANTS.UI.MESSAGE_MAX_WIDTH).toBe('85%');
  });
});
