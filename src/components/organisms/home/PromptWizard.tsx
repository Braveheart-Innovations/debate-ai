import React, { useState } from 'react';
import { 
  Modal, 
  View, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Box } from '@/components/atoms';
import { Button, GradientButton, Typography } from '@/components/molecules';
import { QuickStartTopic } from './QuickStartsSection';
import { useTheme } from '@/theme';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { getPersonality } from '@/config/personalities';
import * as Haptics from 'expo-haptics';

interface PromptWizardProps {
  visible: boolean;
  topic: QuickStartTopic | null;
  onClose: () => void;
  onComplete: (prompt: string, enrichedPrompt: string) => void;
}

const TONES = [
  { id: 'casual', label: 'Casual', emoji: '😊' },
  { id: 'professional', label: 'Professional', emoji: '💼' },
  { id: 'creative', label: 'Creative', emoji: '🎨' },
  { id: 'curious', label: 'Curious', emoji: '🤔' },
  { id: 'supportive', label: 'Supportive', emoji: '🤗' },
];

const CONTEXTS_BY_TOPIC: { [key: string]: Array<{ id: string; label: string; emoji: string }> } = {
  morning: [
    { id: 'productive', label: 'Productive Day', emoji: '⚡' },
    { id: 'relaxed', label: 'Relaxed Day', emoji: '☕' },
    { id: 'motivated', label: 'Need Motivation', emoji: '💪' },
    { id: 'planning', label: 'Planning Ahead', emoji: '📅' },
  ],
  brainstorm: [
    { id: 'business', label: 'Business Ideas', emoji: '💼' },
    { id: 'creative', label: 'Creative Projects', emoji: '🎨' },
    { id: 'technical', label: 'Tech Solutions', emoji: '💻' },
    { id: 'personal', label: 'Personal Goals', emoji: '🎯' },
  ],
  learn: [
    { id: 'science', label: 'Science & Tech', emoji: '🔬' },
    { id: 'history', label: 'History & Culture', emoji: '🏛️' },
    { id: 'skills', label: 'Practical Skills', emoji: '🛠️' },
    { id: 'languages', label: 'Languages', emoji: '🗣️' },
  ],
  creative: [
    { id: 'story', label: 'Story Writing', emoji: '📖' },
    { id: 'poetry', label: 'Poetry', emoji: '✍️' },
    { id: 'worldbuilding', label: 'World Building', emoji: '🌍' },
    { id: 'characters', label: 'Character Development', emoji: '👥' },
  ],
  problem: [
    { id: 'technical', label: 'Technical Issue', emoji: '🔧' },
    { id: 'personal', label: 'Personal Challenge', emoji: '💭' },
    { id: 'work', label: 'Work Related', emoji: '💼' },
    { id: 'creative', label: 'Creative Block', emoji: '🎨' },
  ],
  fun: [
    { id: 'games', label: 'Word Games', emoji: '🎲' },
    { id: 'trivia', label: 'Trivia & Facts', emoji: '🧠' },
    { id: 'jokes', label: 'Jokes & Humor', emoji: '😂' },
    { id: 'roleplay', label: 'Role Playing', emoji: '🎭' },
  ],
};

export const PromptWizard: React.FC<PromptWizardProps> = ({
  visible,
  topic,
  onClose,
  onComplete,
}) => {
  const { theme } = useTheme();
  const [selectedContext, setSelectedContext] = useState('');
  const [selectedTone, setSelectedTone] = useState('casual');
  const [refinement, setRefinement] = useState('');
  const aiPersonalities = useSelector((state: RootState) => state.chat.aiPersonalities);
  const currentSession = useSelector((state: RootState) => state.chat.currentSession);
  
  const handleContextSelect = (contextId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedContext(contextId);
  };
  
  const handleToneSelect = (toneId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTone(toneId);
  };
  
  const handleStartChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { userPrompt, enrichedPrompt } = generatePrompts();
    onComplete(userPrompt, enrichedPrompt);
    resetWizard();
  };
  
  const resetWizard = () => {
    setSelectedContext('');
    setSelectedTone('casual');
    setRefinement('');
  };
  
  const generatePrompts = () => {
    let userPrompt = '';
    let enrichedPrompt = '';
    
    const toneText = TONES.find(t => t.id === selectedTone)?.label.toLowerCase() || 'casual';
    const contextOption = topic && CONTEXTS_BY_TOPIC[topic.id]?.find(c => c.id === selectedContext);
    
    // Build user-visible prompt (what appears to come from the user)
    switch(topic?.id) {
      case 'morning':
        userPrompt = `Good morning! Let's have a ${toneText} chat. `;
        if (refinement) userPrompt += `${refinement} `;
        if (contextOption) {
          if (selectedContext === 'productive') userPrompt += "I'm planning a productive day ahead.";
          else if (selectedContext === 'relaxed') userPrompt += "I'm looking for a relaxed start to my day.";
          else if (selectedContext === 'motivated') userPrompt += "I need some motivation to get going.";
          else if (selectedContext === 'planning') userPrompt += "Help me plan my day effectively.";
        }
        break;
      case 'brainstorm':
        userPrompt = `I need help brainstorming. `;
        if (refinement) userPrompt += `The topic is: ${refinement}. `;
        if (contextOption) {
          if (selectedContext === 'business') userPrompt += "I'm looking for business ideas.";
          else if (selectedContext === 'creative') userPrompt += "Let's explore creative possibilities.";
          else if (selectedContext === 'technical') userPrompt += "I need technical solutions.";
          else if (selectedContext === 'personal') userPrompt += "This is for personal goals.";
        }
        break;
      case 'learn':
        userPrompt = `I'd like to learn something new. `;
        if (refinement) userPrompt += `I'm interested in ${refinement}. `;
        if (contextOption) {
          if (selectedContext === 'science') userPrompt += "Tell me about science or technology.";
          else if (selectedContext === 'history') userPrompt += "Share some history or culture.";
          else if (selectedContext === 'skills') userPrompt += "Teach me a practical skill.";
          else if (selectedContext === 'languages') userPrompt += "Help me with languages.";
        }
        break;
      case 'creative':
        userPrompt = `Let's do some creative writing together. `;
        if (refinement) userPrompt += `The theme is: ${refinement}. `;
        if (contextOption) {
          if (selectedContext === 'story') userPrompt += "Let's create a story.";
          else if (selectedContext === 'poetry') userPrompt += "Help me write poetry.";
          else if (selectedContext === 'worldbuilding') userPrompt += "Let's build an imaginary world.";
          else if (selectedContext === 'characters') userPrompt += "Help me develop characters.";
        }
        break;
      case 'problem':
        userPrompt = `I need help solving a problem. `;
        if (refinement) userPrompt += `${refinement} `;
        if (contextOption) {
          if (selectedContext === 'technical') userPrompt += "It's a technical issue.";
          else if (selectedContext === 'personal') userPrompt += "It's a personal challenge.";
          else if (selectedContext === 'work') userPrompt += "It's work-related.";
          else if (selectedContext === 'creative') userPrompt += "I'm facing a creative block.";
        }
        break;
      case 'fun':
        userPrompt = `Let's have some fun! `;
        if (refinement) userPrompt += `${refinement} `;
        if (contextOption) {
          if (selectedContext === 'games') userPrompt += "Let's play word games.";
          else if (selectedContext === 'trivia') userPrompt += "Share interesting trivia.";
          else if (selectedContext === 'jokes') userPrompt += "Tell me jokes!";
          else if (selectedContext === 'roleplay') userPrompt += "Let's do roleplay.";
        }
        break;
      default:
        userPrompt = `Let's chat! ${refinement}`;
    }
    
    // Build enriched prompt with personality injection
    const selectedAIs = currentSession?.selectedAIs || [];
    if (selectedAIs.length > 0) {
      const aiId = selectedAIs[0].id;
      const personalityId = aiPersonalities[aiId] || 'default';
      const personality = personalityId !== 'default' ? getPersonality(personalityId) : undefined;
      
      if (personality) {
        enrichedPrompt = `[PERSONALITY: ${personality.name}]\n${personality.systemPrompt}\n\n[TONE: ${toneText}]\n\n${userPrompt}`;
      } else {
        enrichedPrompt = `[TONE: ${toneText}]\n\n${userPrompt}`;
      }
    } else {
      enrichedPrompt = userPrompt;
    }
    
    return { userPrompt: userPrompt.trim(), enrichedPrompt: enrichedPrompt.trim() };
  };
  
  if (!topic) return null;
  
  const contexts = CONTEXTS_BY_TOPIC[topic.id] || [];
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={{ 
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
      }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View
            entering={FadeIn}
            style={{
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.borderRadius.xl,
              borderTopRightRadius: theme.borderRadius.xl,
              maxHeight: '85%',
            }}
          >
            {/* Header */}
            <Box 
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.lg,
                paddingBottom: theme.spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <Typography variant="title" weight="bold">
                {topic.emoji} {topic.title}
              </Typography>
              <Button
                title="✕"
                onPress={onClose}
                variant="ghost"
                size="small"
              />
            </Box>
            
            <ScrollView 
              style={{ 
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.md,
              }}
              contentContainerStyle={{
                paddingBottom: theme.spacing.lg,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {/* Context Selection */}
              {contexts.length > 0 && (
                <View style={{ marginBottom: theme.spacing.lg }}>
                  <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
                    What's your focus?
                  </Typography>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                    {contexts.map(ctx => (
                      <TouchableOpacity
                        key={ctx.id}
                        onPress={() => handleContextSelect(ctx.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: theme.spacing.md,
                          paddingVertical: theme.spacing.sm,
                          borderRadius: theme.borderRadius.full,
                          backgroundColor: selectedContext === ctx.id ? theme.colors.primary[500] : theme.colors.surface,
                          borderWidth: 1,
                          borderColor: selectedContext === ctx.id ? theme.colors.primary[500] : theme.colors.border,
                        }}
                      >
                        <Typography style={{ marginRight: 6, fontSize: 18 }}>{ctx.emoji}</Typography>
                        <Typography 
                          variant="body" 
                          weight={selectedContext === ctx.id ? 'semibold' : 'medium'}
                          style={{ color: selectedContext === ctx.id ? '#fff' : theme.colors.text.primary }}
                        >
                          {ctx.label}
                        </Typography>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              
              {/* Tone Selection */}
              <View style={{ marginBottom: theme.spacing.lg }}>
                <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
                  Conversation tone
                </Typography>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  {TONES.map(tone => (
                    <TouchableOpacity
                      key={tone.id}
                      onPress={() => handleToneSelect(tone.id)}
                      style={{
                        paddingHorizontal: theme.spacing.sm,
                        paddingVertical: theme.spacing.xs,
                        borderRadius: theme.borderRadius.md,
                        backgroundColor: selectedTone === tone.id ? theme.colors.primary[100] : theme.colors.surface,
                        borderWidth: 1,
                        borderColor: selectedTone === tone.id ? theme.colors.primary[300] : theme.colors.border,
                      }}
                    >
                      <Typography 
                        variant="caption" 
                        weight={selectedTone === tone.id ? 'semibold' : 'medium'}
                        style={{ color: selectedTone === tone.id ? theme.colors.primary[700] : theme.colors.text.primary }}
                      >
                        {tone.emoji} {tone.label}
                      </Typography>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Optional Refinement */}
              <View style={{ marginBottom: theme.spacing.md }}>
                <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
                  Add details (optional)
                </Typography>
                <TextInput
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.borderRadius.md,
                    padding: theme.spacing.md,
                    color: theme.colors.text.primary,
                    fontSize: 16,
                    minHeight: 60,
                    textAlignVertical: 'top',
                  }}
                  placeholder="Any specific details or questions..."
                  placeholderTextColor={theme.colors.text.disabled}
                  value={refinement}
                  onChangeText={setRefinement}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>
            
            {/* Action Button */}
            <Box 
              style={{
                padding: theme.spacing.lg,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <GradientButton
                title="Start Chat 💬"
                onPress={handleStartChat}
                gradient={theme.colors.gradients.ocean}
                fullWidth
                disabled={contexts.length > 0 && !selectedContext}
              />
            </Box>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};
