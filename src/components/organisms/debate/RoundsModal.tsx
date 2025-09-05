import React from 'react';
import { Modal, View, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';
import { SheetHeader } from '../../molecules/SheetHeader';

interface RoundsModalProps {
  visible: boolean;
  value: number; // 1–5
  onSelect: (n: number) => void;
  onClose: () => void;
}

export const RoundsModal: React.FC<RoundsModalProps> = ({ visible, value, onSelect, onClose }) => {
  const { theme, isDark } = useTheme();
  const options = [1, 2, 3, 4, 5];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={onClose} />
        <View style={{
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '60%',
          overflow: 'hidden',
          ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.25, shadowRadius: 10 }, android: { elevation: 10 } })
        }}>
          <SheetHeader title="Select Rounds" onClose={onClose} showHandle />
          <ScrollView contentContainerStyle={{ padding: theme.spacing.lg }}>
            {options.map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => { onSelect(n); onClose(); }}
                style={{
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                  borderRadius: 12,
                  backgroundColor: n === value
                    ? (isDark ? theme.colors.overlays.medium : theme.colors.primary[50])
                    : theme.colors.card,
                  borderWidth: 1,
                  borderColor: n === value ? theme.colors.primary[400] : theme.colors.border,
                }}
              >
                <Typography variant="body" weight="semibold" style={{ color: n === value ? theme.colors.primary[700] : theme.colors.text.primary }}>
                  {n} Round{n > 1 ? 's' : ''}
                </Typography>
                <Typography variant="caption" color="secondary">
                  {n === 1 ? 'Quick duel' : n === 3 ? 'Classic pacing' : n === 5 ? 'Extended debate' : 'Balanced'}
                </Typography>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

export default RoundsModal;
