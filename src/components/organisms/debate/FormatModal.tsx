/**
 * FormatModal - explanatory modal for choosing a debate format
 */

import React from 'react';
import { Modal, ScrollView, View, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../../theme';
import { Typography, ModalHeader } from '../../molecules';
import { FORMATS, type DebateFormatId, type FormatSpec } from '../../../config/debate/formats';

export interface FormatModalProps {
  visible: boolean;
  selected: DebateFormatId;
  onSelect: (id: DebateFormatId) => void;
  onClose: () => void;
}

export const FormatModal: React.FC<FormatModalProps> = ({ visible, selected, onSelect, onClose }) => {
  const { theme } = useTheme();
  const entries = Object.entries(FORMATS) as [DebateFormatId, FormatSpec][];

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
          <ModalHeader title="Choose Debate Format" onClose={onClose} variant="gradient" />
          <ScrollView contentContainerStyle={{ padding: theme.spacing.lg }} showsVerticalScrollIndicator={false}>
            {entries.map(([id, spec]) => (
              <TouchableOpacity
                key={id}
                onPress={() => { onSelect(id); onClose(); }}
                style={{
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                  borderRadius: 12,
                  backgroundColor: id === selected ? theme.colors.primary[50] : theme.colors.card,
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
                <Typography variant="caption" color="secondary">
                  Phases: {spec.phases.map(p => p.id).join(' → ')}
                </Typography>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

export default FormatModal;
