import React from 'react';
import { View, Text } from 'react-native';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';

interface ActualPricingProps {
  inputPricePerM?: number;
  outputPricePerM?: number;
  freeInfo?: string | null;
  compact?: boolean;
}

export const ActualPricing: React.FC<ActualPricingProps> = ({
  inputPricePerM,
  outputPricePerM,
  freeInfo,
  compact = false,
}) => {
  const { theme } = useTheme();
  
  // If it's a subscription service (Nomi, Replika, etc)
  if (inputPricePerM === 0 && outputPricePerM === 0 && freeInfo) {
    return (
      <Typography 
        variant={compact ? "caption" : "body"}
        style={{ 
          color: theme.colors.success[600],
          fontSize: compact ? 12 : 13,
        }}
      >
        {freeInfo}
      </Typography>
    );
  }
  
  // If we don't have pricing data and no free info
  if ((inputPricePerM === undefined || outputPricePerM === undefined) && !freeInfo) {
    return null;
  }
  
  if (compact) {
    if (inputPricePerM !== undefined && outputPricePerM !== undefined) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Typography variant="caption" color="secondary">
            ${inputPricePerM}/1M in
          </Typography>
          <Typography variant="caption" color="secondary">•</Typography>
          <Typography variant="caption" color="secondary">
            ${outputPricePerM}/1M out
          </Typography>
          {freeInfo && (
            <>
              <Typography variant="caption" color="secondary">•</Typography>
              <Typography variant="caption" color="success">
                {freeInfo}
              </Typography>
            </>
          )}
        </View>
      );
    } else if (freeInfo) {
      return (
        <Typography variant="caption" color="success">
          {freeInfo}
        </Typography>
      );
    }
    return null;
  }
  
  if (inputPricePerM !== undefined && outputPricePerM !== undefined) {
    return (
      <View>
        <Typography variant="caption" color="secondary" style={{ marginBottom: 2 }}>
          API Pricing:
        </Typography>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <Typography variant="body" weight="semibold">
              ${inputPricePerM}
            </Typography>
            <Typography variant="caption" color="secondary">
              /1M input
            </Typography>
          </View>
          <Text style={{ color: theme.colors.text.disabled }}>•</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <Typography variant="body" weight="semibold">
              ${outputPricePerM}
            </Typography>
            <Typography variant="caption" color="secondary">
              /1M output
            </Typography>
          </View>
        </View>
        {freeInfo && (
          <View style={{ 
            backgroundColor: theme.colors.success[50], 
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: theme.borderRadius.sm,
            marginTop: 4,
            alignSelf: 'flex-start',
          }}>
            <Typography variant="caption" color="success" weight="semibold">
              ✨ {freeInfo}
            </Typography>
          </View>
        )}
      </View>
    );
  }
  
  // Only free info available
  if (freeInfo) {
    return (
      <View style={{ 
        backgroundColor: theme.colors.success[50], 
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.sm,
        alignSelf: 'flex-start',
      }}>
        <Typography variant="caption" color="success" weight="semibold">
          ✨ {freeInfo}
        </Typography>
      </View>
    );
  }
  
  return null;
};
