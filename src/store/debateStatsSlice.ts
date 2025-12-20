import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DebateStats {
  [aiId: string]: {
    totalDebates: number;
    roundsWon: number;
    roundsLost: number;
    overallWins: number;
    overallLosses: number;
    lastDebated: number;
    winRate: number; // Calculated percentage
    roundWinRate: number; // Percentage of rounds won
    topics: {
      [topic: string]: {
        participated: number;
        won: number;
      };
    };
  };
}

export interface DebateRound {
  debateId: string;
  topic: string;
  participants: string[];
  roundWinners: { [round: number]: string };
  overallWinner?: string;
  timestamp: number;
}

interface DebateStatsState {
  stats: DebateStats;
  history: DebateRound[];
  currentDebate?: DebateRound;
  preservedTopic: string | null;
  preservedTopicMode: 'preset' | 'custom';
}

const initialState: DebateStatsState = {
  stats: {},
  history: [],
  preservedTopic: null,
  preservedTopicMode: 'preset',
};

const debateStatsSlice = createSlice({
  name: 'debateStats',
  initialState,
  reducers: {
    startDebate: (state, action: PayloadAction<{ debateId: string; topic: string; participants: string[] }>) => {
      const { debateId, topic, participants } = action.payload;
      
      // Initialize current debate
      state.currentDebate = {
        debateId,
        topic,
        participants,
        roundWinners: {},
        timestamp: Date.now(),
      };
      
      // Initialize stats for new participants
      participants.forEach(aiId => {
        if (!state.stats[aiId]) {
          state.stats[aiId] = {
            totalDebates: 0,
            roundsWon: 0,
            roundsLost: 0,
            overallWins: 0,
            overallLosses: 0,
            lastDebated: Date.now(),
            winRate: 0,
            roundWinRate: 0,
            topics: {},
          };
        }
      });
    },
    
    recordRoundWinner: (state, action: PayloadAction<{ round: number; winnerId: string }>) => {
      const { round, winnerId } = action.payload;

      if (state.currentDebate) {
        // Check if this round was already voted on to prevent double-counting
        const alreadyVoted = state.currentDebate.roundWinners[round] !== undefined;

        state.currentDebate.roundWinners[round] = winnerId;

        // Only update stats if this is a NEW vote for this round
        if (!alreadyVoted) {
          // Update winner stats
          if (state.stats[winnerId]) {
            state.stats[winnerId].roundsWon += 1;
          }

          // Update loser stats - only count once per round (not per participant)
          // In a 2-player debate, there's exactly 1 loser per round
          const losers = state.currentDebate.participants.filter(aiId => aiId !== winnerId);
          losers.forEach(aiId => {
            if (state.stats[aiId]) {
              state.stats[aiId].roundsLost += 1;
            }
          });
        }
      }
    },
    
    recordOverallWinner: (state, action: PayloadAction<{ winnerId: string }>) => {
      const { winnerId } = action.payload;
      
      if (state.currentDebate) {
        state.currentDebate.overallWinner = winnerId;
        
        // Update stats for all participants
        state.currentDebate.participants.forEach(aiId => {
          if (state.stats[aiId]) {
            state.stats[aiId].totalDebates += 1;
            state.stats[aiId].lastDebated = Date.now();
            
            // Update topic stats
            const topic = state.currentDebate!.topic;
            if (!state.stats[aiId].topics[topic]) {
              state.stats[aiId].topics[topic] = {
                participated: 0,
                won: 0,
              };
            }
            state.stats[aiId].topics[topic].participated += 1;
            
            // Update winner/loser stats
            if (aiId === winnerId) {
              state.stats[aiId].overallWins += 1;
              state.stats[aiId].topics[topic].won += 1;
            } else {
              state.stats[aiId].overallLosses += 1;
            }
            
            // Calculate win rates
            state.stats[aiId].winRate = 
              (state.stats[aiId].overallWins / state.stats[aiId].totalDebates) * 100;
            
            const totalRounds = state.stats[aiId].roundsWon + state.stats[aiId].roundsLost;
            state.stats[aiId].roundWinRate = totalRounds > 0 ?
              (state.stats[aiId].roundsWon / totalRounds) * 100 : 0;
          }
        });
        
        // Add to history
        state.history.push(state.currentDebate);
        
        // Clear current debate
        state.currentDebate = undefined;
      }
    },
    
    clearStats: (state) => {
      state.stats = {};
      state.history = [];
      state.currentDebate = undefined;
    },
    
    preserveTopic: (state, action: PayloadAction<{ topic: string; mode: 'preset' | 'custom' }>) => {
      state.preservedTopic = action.payload.topic;
      state.preservedTopicMode = action.payload.mode;
    },
    
    clearPreservedTopic: (state) => {
      state.preservedTopic = null;
      state.preservedTopicMode = 'preset';
    },

    restoreStats: (state, action: PayloadAction<{ stats: DebateStats; history: DebateRound[] }>) => {
      state.stats = action.payload.stats;
      state.history = action.payload.history;
    },
  },
});

export const { startDebate, recordRoundWinner, recordOverallWinner, clearStats, preserveTopic, clearPreservedTopic, restoreStats } = debateStatsSlice.actions;
export default debateStatsSlice.reducer;