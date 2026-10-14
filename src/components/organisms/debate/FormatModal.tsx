/**
 * FormatModal - explanatory modal for choosing a debate format
 */

import React from 'react';
import { Modal, ScrollView, View, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';
import { SheetHeader } from '@/components/molecules';
import {
  SELECTABLE_FORMATS,
  type DebateFormatId,
  type FormatSpec,
  type SelectableDebateFormatId,
} from '../../../config/debate/formats';

export interface FormatModalProps {
  visible: boolean;
  selected: DebateFormatId;
  onSelect: (id: DebateFormatId) => void;
  onClose: () => void;
}

export const FormatModal: React.FC<FormatModalProps> = ({ visible, selected, onSelect, onClose }) => {
  const { theme, isDark } = useTheme();
  const entries = Object.entries(SELECTABLE_FORMATS) as [SelectableDebateFormatId, FormatSpec][];

  const HIGHLIGHTS: Record<SelectableDebateFormatId, string[]> = {
    oxford: [
      '⚖️ Motion debate with proposition and opposition sides',
      '🗣️ Choose 1v1, 2v2, or 2v2 + Q&A with audience questions',
      '🎯 Opening stance and final audience vote decide the result',
    ],
    lincoln_douglas: [
      '🤔 Great for ethical dilemmas and moral questions',
      '💭 AC, CX, NC/1NR, 1AR, NR/2NR, and 2AR structure',
      '📚 Judge checkpoints focus on values, criteria, and ballot weighing',
    ],
    policy: [
      '📊 Perfect for policy proposals and real-world issues',
      '🔬 1AC, 1NC, 2AC, 2NC, 1NR, 1AR, 2NR, and 2AR',
      '💡 Judge checkpoints focus on plan text, solvency, impacts, and drops',
    ],
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Backdrop */}
        <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={onClose} />
        {/* Bottom sheet */}
        <View style={{
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '75%',
          overflow: 'hidden',
          ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.25, shadowRadius: 10 }, android: { elevation: 10 } })
        }}>
          <SheetHeader title="Choose Debate Format" onClose={onClose} showHandle />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.spacing.lg }} showsVerticalScrollIndicator={false}>
            {entries.map(([id, spec]) => (
              <TouchableOpacity
                key={id}
                onPress={() => { onSelect(id); onClose(); }}
                style={{
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                  borderRadius: 12,
                  backgroundColor: id === selected
                    ? (isDark ? theme.colors.overlays.medium : theme.colors.primary[50])
                    : theme.colors.card,
                  borderWidth: 1,
                  borderColor: id === selected ? theme.colors.primary[400] : theme.colors.border,
                }}
              >
                <Typography variant="subtitle" weight="semibold" style={{ marginBottom: 4 }}>
                  {spec.name}
                </Typography>
                <Typography variant="body" color="secondary" style={{ marginBottom: 6 }}>
                  {spec.description}
                </Typography>
                {HIGHLIGHTS[id].map((h, idx) => (
                  <Typography key={idx} variant="caption" color="secondary" style={{ marginTop: idx === 0 ? 0 : 2 }}>
                    • {h}
                  </Typography>
                ))}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

export default FormatModal;
