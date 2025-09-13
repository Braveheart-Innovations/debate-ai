/**
 * Configuration constants for the debate feature
 * These are extracted from the original DebateScreen to centralize configuration
 */

export const DEBATE_CONSTANTS = {
  // Round configuration
  MAX_ROUNDS: 3,
  MESSAGES_PER_ROUND: 1, // Each AI speaks once per round
  
  // Timing configuration (in milliseconds)
  DELAYS: {
    AI_RESPONSE: 12000,       // Legacy delay used when not streaming
    POST_STREAM_PAUSE: 2000,  // Short pause after a streamed message completes
    RATE_LIMIT_RECOVERY: 10000, // Delay after rate limit errors
    ERROR_RECOVERY: 6000,     // Delay after other errors
    VOTING_CONTINUATION: 500,  // Short delay after voting to keep flow going
    OVERALL_VOTE: 800,        // Delay before showing overall vote
    AUTO_SCROLL: 100,         // Delay before auto-scrolling to new messages
  },
  
  // Message content configuration - professional, engaging style
  MESSAGES: {
    ROUND_START: (round: number) => `Exchange ${round}`,
    FINAL_ROUND: 'Final Exchange',
    DEBATE_START: (topic: string, firstAI: string) => 
      `"${topic}"\n\n${firstAI} opens the debate.`,
    DEBATE_COMPLETE: 'Debate complete.\n\nVote for the final winner.',
    // Winner messages are now generated per exchange label in VotingService
    ROUND_WINNER: (_round: number, winner: string) => `Exchange: ${winner}`,
    FINAL_ROUND_WINNER: (winner: string) => `Final Exchange: ${winner}`,
    OVERALL_WINNER: (winner: string) => `OVERALL WINNER: ${winner}!\n\n${winner} won the debate.`,
    RATE_LIMIT: (aiName: string) => `${aiName} is taking a moment...`,
    ERROR: (aiName: string) => `${aiName} had an error. Continuing...`,
  },
  
  // Voting configuration
  VOTING: {
    ROUND_PROMPT: (_round: number) => `🏅 Who won this exchange?`,
    FINAL_ROUND_PROMPT: '🏅 Who won the final exchange?',
    OVERALL_PROMPT: '🏆 Vote for Overall Winner!',
    SCORE_OVERRIDE_TEXT: 'Despite the scores, you can crown any AI as the overall winner!',
  },
  
  // Prompt building
  PROMPT_MARKERS: {
    DEBATE_MODE: '[DEBATE MODE]',
    TOPIC_PREFIX: 'Motion: ',
    PREVIOUS_SPEAKER: 'The previous speaker said: ',
    FINAL_ARGUMENT: 'Make your final argument!',
    CONTINUE_DEBATE: 'Continue the debate!',
  },
  
  // UI Configuration
  UI: {
    RATE_LIMIT_NOTE: 'Note: Debates have built-in delays to respect API rate limits',
    DROPDOWN_MAX_HEIGHT: 200,
    MESSAGE_MAX_WIDTH: '85%',
    TOPIC_INPUT_MIN_HEIGHT: 60,
  },
} as const;

export type DebateConstants = typeof DEBATE_CONSTANTS;
