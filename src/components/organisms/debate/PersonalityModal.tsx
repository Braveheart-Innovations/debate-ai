/**
 * PersonalityModal Component
 * Full-screen modal for selecting a personality with richer content
 */

import React, { useMemo, useState } from 'react';
import { Modal, View, TouchableOpacity, FlatList, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';
import { ModalHeader } from '../../molecules/ModalHeader';
import { GradientButton, Button } from '../../molecules';
import { PersonalityOption } from '../../../config/personalities';

export interface PersonalityModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (personalityId: string) => void;
  selectedPersonalityId: string;
  availablePersonalities: PersonalityOption[];
  isPremium: boolean;
  context?: 'chat' | 'debate';
  aiId?: string;
  aiName?: string;
  initialTab?: 'signature' | 'seasonal';
  onPreview?: (personalityId: string) => void;
  onUpgrade?: () => void;
  disableBackdropDismiss?: boolean;
  testID?: string;
}

const ICONS: Record<string, string> = {
  default: '🤖',
  prof_sage: '🎓',
  brody: '🏈',
  bestie: '💖',
  zen: '🧘',
  skeptic: '🔍',
  scout: '📖',
  devlin: '😈',
  george: '🎤',
  pragmatist: '🧭',
  enforcer: '📎',
  traditionalist: '🧱',
};

const FREE_SET = new Set(['default', 'prof_sage']);

export const PersonalityModal: React.FC<PersonalityModalProps> = ({
  visible,
  onClose,
  onConfirm,
  selectedPersonalityId,
  availablePersonalities,
  isPremium,
  aiName: _aiName,
  onPreview,
  onUpgrade,
  disableBackdropDismiss = false,
  testID,
}) => {
  const { theme } = useTheme();
  const [localSelection, setLocalSelection] = useState<string>(selectedPersonalityId);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const canConfirm = useMemo(() => {
    if (!localSelection) return false;
    if (isPremium) return true;
    return FREE_SET.has(localSelection);
  }, [localSelection, isPremium]);

  const sortedPersonas = useMemo(() => {
    // Keep free first for non-premium, otherwise stable order
    if (isPremium) return availablePersonalities;
    return [...availablePersonalities].sort((a, b) => {
      const aFree = FREE_SET.has(a.id) ? 1 : 0;
      const bFree = FREE_SET.has(b.id) ? 1 : 0;
      return bFree - aFree;
    });
  }, [availablePersonaltiesHash(availablePersonalities), isPremium]);

  function availablePersonaltiesHash(list: PersonalityOption[]) {
    // stable memo key
    return list.map(p => p.id).join('|');
  }

  const renderItem = ({ item }: { item: PersonalityOption }) => {
    const isSelected = localSelection === item.id;
    const isLocked = !isPremium && !FREE_SET.has(item.id);
    const icon = ICONS[item.id] || '🤖';

    return (
      <TouchableOpacity
        onPress={() => {
          if (!isLocked) setLocalSelection(item.id);
        }}
        activeOpacity={0.9}
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: isSelected ? theme.colors.primary[400] : theme.colors.border,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Typography weight="bold" style={{ fontSize: 18 }}>
            {icon} {item.name}
          </Typography>
          {isLocked && (
            <Typography variant="caption" style={{ marginLeft: 8 }}>
              🔒
            </Typography>
          )}
        </View>
        <Typography variant="caption" color="secondary" numberOfLines={2}>
          {item.description}
        </Typography>
        {previewingId === item.id && (
          <View style={{ marginTop: 8 }}>
            <Typography variant="caption" style={{ fontStyle: 'italic' }}>
              {item.previewLine || 'Preview unavailable.'}
            </Typography>
          </View>
        )}
        <View style={{ flexDirection: 'row', marginTop: 10, justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => {
              setPreviewingId(prev => (prev === item.id ? null : item.id));
              onPreview?.(item.id);
            }}
            accessibilityLabel={`Preview ${item.name}`}
          >
            <Typography variant="caption" color="secondary">
              Preview
            </Typography>
          </TouchableOpacity>
          {isSelected && (
            <Typography variant="caption" color="secondary">
              Selected
            </Typography>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
      testID={testID}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => {
          if (!disableBackdropDismiss) onClose();
        }}
        style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
      />
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <ModalHeader title="Choose a Personality" onClose={onClose} />

        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          <FlatList
            data={sortedPersonas}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ paddingBottom: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
          />
        </View>

        <View style={{ padding: 16 }}>
          <GradientButton
            title={canConfirm ? 'Use This Style' : isPremium ? 'Select a style' : 'Unlock to use this style'}
            onPress={() => canConfirm && onConfirm(localSelection)}
            disabled={!canConfirm}
            gradient={theme.colors.gradients.primary}
            fullWidth
          />
          {!isPremium && (
            <Button
              title="Learn about styles"
              onPress={onUpgrade || onClose}
              variant="ghost"
              fullWidth
              style={{ marginTop: 8 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    position: 'absolute',
    top: Platform.select({ ios: 60, android: 40, default: 40 }),
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  card: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 120,
    marginBottom: 12,
  },
});

export default PersonalityModal;
