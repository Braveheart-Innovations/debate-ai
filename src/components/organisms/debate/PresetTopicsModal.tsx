import React, { useState } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../../theme';
import { Typography, Button } from '../../molecules';
import { SheetHeader } from '@/components/molecules';
import { TopicService } from '../../../services/debate/TopicService';

export interface PresetTopicsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectTopic: (topic: string) => void;
}

export const PresetTopicsModal: React.FC<PresetTopicsModalProps> = ({ visible, onClose, onSelectTopic }) => {
  const { theme } = useTheme();
  const categories = TopicService.getCategories();
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || 'fun');
  const topics = TopicService.getTopicsByCategory(categories.find(c => c.id === categoryId)?.name || 'Fun & Quirky');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={onClose} />
        <View style={{
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '80%',
          overflow: 'hidden',
          ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.25, shadowRadius: 10 }, android: { elevation: 10 } })
        }}>
          <SheetHeader title="Choose a Preset Topic" onClose={onClose} showHandle />

          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 0 }}>
            {categories.map(cat => (
              <Button
                key={cat.id}
                title={cat.name}
                onPress={() => setCategoryId(cat.id)}
                variant={categoryId === cat.id ? 'primary' : 'secondary'}
                size="small"
                style={{ marginRight: 8 }}
              />
            ))}
          </ScrollView>

          {/* Topics list */}
          <ScrollView style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
            {topics.map(topic => (
              <TouchableOpacity
                key={topic}
                onPress={() => { onSelectTopic(topic); onClose(); }}
                style={{
                  padding: theme.spacing.md,
                  marginTop: theme.spacing.sm,
                  borderRadius: 12,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Typography variant="body" weight="semibold">{topic}</Typography>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

export default PresetTopicsModal;
