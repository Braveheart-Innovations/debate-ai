/**
 * PersonalityModal Component
 * Full-screen modal for selecting a personality with richer content
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, TouchableOpacity, FlatList, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';
import { SheetHeader } from '@/components/molecules';
import { GradientButton } from '../../molecules';
import { PersonalityOption } from '../../../config/personalities';

export interface PersonalityModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (personalityId: string) => void;
  selectedPersonalityId: string;
  availablePersonalities: PersonalityOption[];
  aiName?: string;
  disableBackdropDismiss?: boolean;
  testID?: string;
}

export const PersonalityModal: React.FC<PersonalityModalProps> = ({
  visible,
  onClose,
  onConfirm,
  selectedPersonalityId,
  availablePersonalities,
  aiName,
  disableBackdropDismiss = false,
  testID,
}) => {
  const { theme } = useTheme();
  const [localSelection, setLocalSelection] = useState<string>(selectedPersonalityId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLocalSelection(selectedPersonalityId);
      setExpandedId(null);
    }
  }, [selectedPersonalityId, visible]);

  const canConfirm = useMemo(() => {
    return Boolean(localSelection);
  }, [localSelection]);

  const sortedPersonas = useMemo(() => {
    const [defaults, rest] = availablePersonalities.reduce<[
      PersonalityOption[],
      PersonalityOption[]
    ]>((acc, persona) => {
      if (persona.id === 'default') {
        acc[0].push(persona);
      } else {
        acc[1].push(persona);
      }
      return acc;
    }, [[], []]);
    return [...defaults, ...rest.sort((a, b) => a.name.localeCompare(b.name))];
  }, [availablePersonalities]);

  const renderItem = ({ item }: { item: PersonalityOption }) => {
    const isSelected = localSelection === item.id;
    const isDefault = item.id === 'default';
    const isExpanded = !isDefault && expandedId === item.id;
    const signaturePreview = item.signatureMoves[0];
    const samplePreview = item.sampleOpeners?.chat;

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: isSelected ? theme.colors.primary[400] : theme.colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => setLocalSelection(item.id)}
          activeOpacity={0.9}
          style={{ marginBottom: 8 }}
        >
          <Typography weight="bold" style={{ fontSize: 18, marginBottom: 4 }}>
            {item.emoji} {item.name}
          </Typography>
          <Typography variant="caption" color="secondary" numberOfLines={2}>
            {item.tagline}
          </Typography>
          {isDefault && (
            <Typography variant="caption" color="secondary" style={{ marginTop: 6 }}>
              {item.bio}
            </Typography>
          )}
          {!isDefault && signaturePreview && (
            <Typography variant="caption" color="secondary" style={{ marginTop: 6 }}>
              • {signaturePreview}
            </Typography>
          )}
          {!isDefault && samplePreview && (
            <Typography
              variant="caption"
              style={{ fontStyle: 'italic', marginTop: 6 }}
              numberOfLines={2}
            >
              “{samplePreview}”
            </Typography>
          )}
          {isSelected && (
            <Typography variant="caption" color="secondary" style={{ marginTop: 6 }}>
              Selected
            </Typography>
          )}
        </TouchableOpacity>

        {!isDefault && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
            style={{ paddingVertical: 4 }}
          >
            <Typography variant="caption" color="primary" weight="semibold" style={{ textAlign: 'center' }}>
              {isExpanded ? 'Hide details ▲' : 'View details ▼'}
            </Typography>
          </TouchableOpacity>
        )}

        {isExpanded && (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Typography variant="caption" color="secondary">
              {item.bio}
            </Typography>

            {item.signatureMoves.length > 0 && (
              <View>
                <Typography variant="caption" weight="semibold" style={{ marginBottom: 2 }}>
                  Signature moves
                </Typography>
                {item.signatureMoves.map(move => (
                  <Typography key={move} variant="caption" style={{ marginBottom: 2 }}>
                    • {move}
                  </Typography>
                ))}
              </View>
            )}

            {item.watchouts && item.watchouts.length > 0 && (
              <View>
                <Typography variant="caption" weight="semibold" style={{ marginBottom: 2 }}>
                  Watch outs
                </Typography>
                {item.watchouts.map(note => (
                  <Typography key={note} variant="caption" color="secondary">
                    {note}
                  </Typography>
                ))}
              </View>
            )}

          </View>
        )}
      </View>
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
            title="Use This Style"
            onPress={() => canConfirm && onConfirm(localSelection)}
            disabled={!canConfirm}
            gradient={theme.colors.gradients.primary}
            fullWidth
          />
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
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 160,
    marginBottom: 12,
  },
});

export default PersonalityModal;
