/**
 * TopicSelector Organism Component
 * Complete topic selection interface for debates
 * Uses topic selection hook and related molecules
 */

import React from 'react';
import { TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Box } from '../../atoms';
import { Button, GradientButton, Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { catalog } from '../../../config/debate/topics';
import { UseTopicSelectionReturn } from '../../../hooks/debate';

export interface TopicSelectorProps extends UseTopicSelectionReturn {
  onStartDebate: () => void;
}

export const TopicSelector: React.FC<TopicSelectorProps> = ({
  selectedTopic,
  customTopic,
  topicMode,
  showTopicDropdown,
  isTopicSelected,
  finalTopic,
  setSelectedTopic,
  setCustomTopic,
  setTopicMode,
  setShowTopicDropdown,
  selectRandomTopic,
  validateCurrentTopic,
  onStartDebate,
}) => {
  const { theme } = useTheme();

  const handleStartDebate = () => {
    const validation = validateCurrentTopic();
    if (!validation.valid) {
      Alert.alert('Invalid Motion', validation.error || 'Please select a valid motion');
      return;
    }
    onStartDebate();
  };

  return (
    <Animated.View 
      entering={FadeInDown} 
      style={{
        padding: 16,
        marginBottom: 16,
        backgroundColor: theme.colors.card,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Typography variant="title" weight="semibold">Choose Your Battle!</Typography>
      
      {/* Motion Mode Selector */}
      <Box style={{
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
        marginTop: 16,
      }}>
        <Button
          title="📋 Select Motion"
          onPress={() => {
            setTopicMode('preset');
            setSelectedTopic('');
            setCustomTopic('');
          }}
          variant={topicMode === 'preset' ? 'primary' : 'secondary'}
          size="medium"
          style={{ flex: 1, marginRight: 4 }}
        />
        
        <Button
          title="✏️ Custom Motion"
          onPress={() => {
            setTopicMode('custom');
            setSelectedTopic('');
          }}
          variant={topicMode === 'custom' ? 'primary' : 'secondary'}
          size="medium"
          style={{ flex: 1, marginLeft: 4 }}
        />
      </Box>

      {topicMode === 'preset' ? (
        <>
          {/* Dropdown Selector */}
          <TouchableOpacity
            style={{
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: 10,
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderWidth: 1,
            }}
            onPress={() => setShowTopicDropdown(!showTopicDropdown)}
          >
            <Typography style={{ flex: 1, fontSize: 15 }}>
              {selectedTopic || 'Select a debate motion...'}
            </Typography>
            <Typography style={{ 
              fontSize: 14, 
              marginLeft: 8, 
              color: theme.colors.text.secondary 
            }}>
              {showTopicDropdown ? '▲' : '▼'}
            </Typography>
          </TouchableOpacity>

          {/* Dropdown List */}
          {showTopicDropdown && (
            <Animated.View 
              entering={FadeIn} 
              style={{
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                shadowColor: theme.colors.shadow,
                marginTop: 8,
                borderRadius: 10,
                borderWidth: 1,
                maxHeight: 200,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                {catalog.topics.map((t, index) => (
                  <TouchableOpacity
                    key={t.id}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderBottomWidth: index < catalog.topics.length - 1 ? 1 : 0,
                      borderBottomColor: theme.colors.border,
                    }}
                    onPress={() => {
                      setSelectedTopic(t.text);
                      setShowTopicDropdown(false);
                    }}
                  >
                    <Typography style={{ fontSize: 14 }}>{t.text}</Typography>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Random Motion Button */}
          <GradientButton
            title="🎲 Surprise Me!"
            onPress={() => {
              selectRandomTopic();
              setShowTopicDropdown(false);
            }}
            gradient={theme.colors.gradients.sunset}
            fullWidth
            style={{ marginTop: 12 }}
          />
        </>
      ) : (
        <>
          {/* Custom Motion Input */}
          <TextInput
            style={{
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text.primary,
              borderRadius: 10,
              paddingVertical: 12,
              paddingHorizontal: 16,
              fontSize: 15,
              borderWidth: 1,
              minHeight: 60,
              textAlignVertical: 'top',
            }}
            placeholder="Enter your debate motion..."
            placeholderTextColor={theme.colors.text.disabled}
            value={customTopic}
            onChangeText={setCustomTopic}
            multiline
            numberOfLines={2}
          />
          <GradientButton
            title="Use This Motion"
            onPress={() => customTopic && setSelectedTopic(customTopic)}
            disabled={!customTopic}
            gradient={theme.colors.gradients.primary}
            fullWidth
            style={{ marginTop: 12 }}
          />
        </>
      )}

      {/* Selected Topic Display */}
      {isTopicSelected && (
        <Box style={{
          backgroundColor: theme.colors.card,
          shadowColor: theme.colors.shadow,
          padding: 16,
          marginTop: 16,
          borderRadius: 12,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        }}>
          <Typography variant="caption" color="brand" weight="medium">Motion:</Typography>
          <Typography variant="title" weight="semibold">
            "{finalTopic}"
          </Typography>
        </Box>
      )}

      {/* Start Button */}
      {isTopicSelected && (
        <>
          <GradientButton
            title="🤜 Start the Debate! 🤛"
            onPress={handleStartDebate}
            gradient={theme.colors.gradients.ocean}
            fullWidth
            style={{ marginTop: 16 }}
          />
          <Typography 
            variant="caption" 
            color="secondary" 
            align="center" 
            style={{ marginTop: 8 }}
          >
            Note: Debates have built-in delays to respect API rate limits
          </Typography>
        </>
      )}
    </Animated.View>
  );
};
