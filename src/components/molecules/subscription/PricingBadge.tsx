import React from 'react';
import { View } from 'react-native';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

interface PricingBadgeProps {
  costPerMessage: string;
  freeInfo?: string | null;
  compact?: boolean;
}

export const PricingBadge: React.FC<PricingBadgeProps> = ({
  costPerMessage,
  freeInfo,
  compact = false,
}) => {
  const { theme } = useTheme();
  
  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Typography variant="caption" color="secondary">
          ~{costPerMessage}/msg
        </Typography>
        {freeInfo && (
          <>
            <Typography variant="caption" color="secondary">•</Typography>
            <Typography variant="caption" color="success" weight="semibold">
              {freeInfo}
            </Typography>
          </>
        )}
      </View>
    );
  }
  
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Typography variant="caption" color="secondary">Est. cost:</Typography>
        <Typography variant="body" color="primary" weight="semibold">
          {costPerMessage}
        </Typography>
        <Typography variant="caption" color="secondary">per message</Typography>
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
};
