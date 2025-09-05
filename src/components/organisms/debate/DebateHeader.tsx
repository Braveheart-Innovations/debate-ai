/**
 * DebateHeader Organism Component
 * Header component for the debate screen with navigation and status
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';

export interface DebateHeaderProps {
  onStartOver?: () => void;
  currentRound?: number;
  maxRounds?: number;
  isActive?: boolean;
  showStartOver?: boolean;
}

export const DebateHeader: React.FC<DebateHeaderProps> = ({
  onStartOver,
  currentRound,
  maxRounds = 3,
  isActive = false,
  showStartOver = true,
}) => {
  const { theme } = useTheme();

  return (
    <Box style={{
      backgroundColor: theme.colors.surface,
      borderBottomColor: theme.colors.border,
      alignItems: 'center',
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      shadowColor: theme.colors.shadowDark,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 4,
    }}>
      {/* Title with gradient background */}
      <Box style={{
        paddingHorizontal: 24,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: theme.colors.primary[50],
        marginBottom: 4,
      }}>
        <Typography variant="title" weight="bold" style={{ 
          fontSize: 22,
          color: theme.colors.primary[700],
          letterSpacing: 0.5,
        }}>
          🎭 AI Debate Arena
        </Typography>
      </Box>
      
      {/* Exchange Counter */}
      {isActive && currentRound && (
        <Box style={{
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 12,
          backgroundColor: theme.colors.secondary[50],
          marginBottom: 6,
        }}>
          <Typography 
            variant="body" 
            weight="semibold"
            style={{ 
              fontSize: 14,
              color: theme.colors.secondary[700],
            }}
          >
            Exchange {currentRound} of {maxRounds}
          </Typography>
        </Box>
      )}
      
      {/* Start Over Button */}
      {showStartOver && onStartOver && (
        <TouchableOpacity 
          onPress={onStartOver}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: theme.colors.error[50],
            borderWidth: 1,
            borderColor: theme.colors.error[200],
          }}
        >
          <Typography style={{ 
            fontSize: 13,
            fontWeight: '600',
            color: theme.colors.error[700],
          }}>
            🔄 Start Over
          </Typography>
        </TouchableOpacity>
      )}
    </Box>
  );
};
