import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Box } from '@/components/atoms';
import { Badge } from '../common/Badge';

interface ProviderFeaturesProps {
  features: string[];
  maxVisible?: number;
  badgeVariant?: 'premium' | 'default' | 'new' | 'experimental';
  style?: ViewStyle;
  testID?: string;
}

export const ProviderFeatures: React.FC<ProviderFeaturesProps> = ({
  features,
  maxVisible = 3,
  badgeVariant = 'default',
  style,
  testID,
}) => {

  if (!features || features.length === 0) {
    return null;
  }

  const visibleFeatures = features.slice(0, maxVisible);
  const hiddenCount = Math.max(0, features.length - maxVisible);

  return (
    <Box
      style={[
        styles.container,
        style,
      ]}
      testID={testID}
    >
      <Box style={styles.featuresContainer}>
        {visibleFeatures.map((feature, index) => (
          <Badge
            key={`${feature}-${index}`}
            label={feature}
            type={badgeVariant}
          />
        ))}
        
        {hiddenCount > 0 && (
          <Badge
            label={`+${hiddenCount} more`}
            type="new"
          />
        )}
      </Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    // Container styles
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featureBadge: {
    marginBottom: 4,
  },
  moreBadge: {
    marginBottom: 4,
  },
});
