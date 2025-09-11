/**
 * PersonalityModal Component
 * Full-screen modal for selecting a personality with richer content
 */

import React, { useMemo, useState } from 'react';
import { Modal, View, TouchableOpacity, FlatList, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';
import { SheetHeader } from '@/components/molecules';
import { GradientButton, Button } from '../../molecules';
import { PersonalityOption } from '../../../config/personalities';
import { PersonalityService } from '../../../services/debate/PersonalityService';
import { } from 'react-native';

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
  aiName,
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
    if (isPremium) return availablePersonalities;
    const list = [...availablePersonalities];
    list.sort((a, b) => {
      const aFree = FREE_SET.has(a.id) ? 1 : 0;
      const bFree = FREE_SET.has(b.id) ? 1 : 0;
      return bFree - aFree;
    });
    return list;
  }, [availablePersonalities, isPremium]);

  const renderItem = ({ item }: { item: PersonalityOption }) => {
    const isSelected = localSelection === item.id;
    const isLocked = !isPremium && !FREE_SET.has(item.id);
    const icon = ICONS[item.id] || '🤖';
    const snapshot = PersonalityService.getTraitSnapshot(item.id);

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
        {/* Compact trait tags for clarity */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 }}>
          {renderTag('Formality', level(snapshot.formality), theme.colors.primary[500])}
          {renderTag('Humor', level(snapshot.humor), theme.colors.warning[600])}
          {renderTag('Energy', level(snapshot.energy), theme.colors.success[600])}
        </View>
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
        <SheetHeader title="Choose a Personality" onClose={onClose} showHandle />
        {aiName ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
            <Typography variant="caption" color="secondary">for {aiName}</Typography>
          </View>
        ) : null}
        {/* Suggested pairings removed to simplify mobile layout */}

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

// Helpers
function level(v: number): 'Low' | 'Medium' | 'High' {
  if (v < 0.34) return 'Low';
  if (v < 0.67) return 'Medium';
  return 'High';
}

function renderTag(label: string, value: string, color: string) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <Typography variant="caption" style={{ color }}>
        {label}: {value}
      </Typography>
    </View>
  );
}
