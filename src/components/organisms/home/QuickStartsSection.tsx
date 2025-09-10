import React from 'react';
import { View } from 'react-native';
import { Box } from '@/components/atoms';
import { SectionHeader } from '@/components/molecules';
import { QuickStartTile } from './QuickStartTile';
import { useTheme } from '@/theme';

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
  const { theme } = useTheme();
  
  return (
    <Box style={{ opacity: disabled ? 0.5 : 1 }}>
      <SectionHeader
        title="Quick Starts"
        subtitle={disabled ? "Select at least one AI to enable" : "Conversation starters with smart prompts"}
        icon="💫"
      />
      
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {topics.map((topic, index) => (
          <View
            key={topic.id}
            style={{
              width: '48%',
              marginRight: index % 2 === 0 ? '4%' : 0,
              marginBottom: theme.spacing.md,
            }}
          >
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
