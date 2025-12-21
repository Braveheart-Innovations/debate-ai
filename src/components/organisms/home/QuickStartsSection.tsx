import React, { useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Box } from '@/components/atoms';
import { SectionHeader } from '@/components/molecules';
import { QuickStartTile } from './QuickStartTile';
import { useResponsive } from '@/hooks/useResponsive';

export interface QuickStartTopic {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
}

interface QuickStartsSectionProps {
  topics: QuickStartTopic[];
  onSelectTopic: (topic: QuickStartTopic) => void;
  disabled?: boolean;
}

export const QuickStartsSection: React.FC<QuickStartsSectionProps> = ({
  topics,
  onSelectTopic,
  disabled = false,
}) => {
  const { width } = useWindowDimensions();
  const { gridColumns, rs } = useResponsive();

  // Responsive column count: 2 on phone, 3 on tablet portrait, 4 on tablet landscape
  const columns = gridColumns(2, 3, 4);
  const gap = rs('md');

  // Calculate item width based on columns
  const itemStyles = useMemo(() => {
    const gapPercentage = (gap / width) * 100;
    const totalGapsPercentage = gapPercentage * (columns - 1);
    const itemWidth = (100 - totalGapsPercentage) / columns;

    return {
      width: `${itemWidth}%` as const,
      marginBottom: gap,
    };
  }, [columns, gap, width]);

  return (
    <Box style={{ opacity: disabled ? 0.5 : 1 }}>
      <SectionHeader
        title="Quick Starts"
        subtitle={disabled ? "Select at least one AI to enable" : "Conversation starters with smart prompts"}
        icon="💫"
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {topics.map((topic, index) => (
          <View key={topic.id} style={itemStyles}>
            <QuickStartTile
              emoji={topic.emoji}
              title={topic.title}
              subtitle={topic.subtitle}
              onPress={() => onSelectTopic(topic)}
              index={index}
              disabled={disabled}
            />
          </View>
        ))}
      </View>
    </Box>
  );
};
