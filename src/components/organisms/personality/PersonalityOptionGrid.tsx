/**
 * PersonalityOptionGrid
 *
 * Two-column grid of personality cards with expandable details. Presentation
 * for PagedSheet personality pages (tap = commit immediately); selection
 * semantics belong to the caller via onSelectPersonality.
 */

import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import { PersonalityOption } from '@/config/personalities';

interface PersonalityOptionGridProps {
  personalities: PersonalityOption[];
  selectedPersonalityId: string;
  onSelectPersonality: (personalityId: string) => void;
  testID?: string;
}

export const PersonalityOptionGrid: React.FC<PersonalityOptionGridProps> = ({
  personalities,
  selectedPersonalityId,
  onSelectPersonality,
  testID,
}) => {
  const { theme } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedPersonas = useMemo(() => {
    const [defaults, rest] = personalities.reduce<[
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
  }, [personalities]);

  const renderItem = ({ item }: { item: PersonalityOption }) => {
    const isSelected = selectedPersonalityId === item.id;
    const isDefault = item.id === 'default';
    const isExpanded = !isDefault && expandedId === item.id;
    const signaturePreview = item.signatureMoves[0];
    const samplePreview = item.sampleOpeners?.chat;

    // The whole card selects (padding and the space a shorter card gets from
    // its taller row neighbour included); "View details" is its own target.
    return (
      <TouchableOpacity
        onPress={() => onSelectPersonality(item.id)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: isSelected ? theme.colors.primary[400] : theme.colors.border,
          },
        ]}
        testID={testID ? `${testID}-option-${item.id}` : undefined}
      >
        <View style={{ marginBottom: 8 }}>
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
        </View>

        {!isDefault && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
            style={{ paddingVertical: 4 }}
            testID={testID ? `${testID}-details-${item.id}` : undefined}
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
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={sortedPersonas}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ paddingBottom: 24, gap: 12 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    />
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 160,
    marginBottom: 12,
  },
});

export default PersonalityOptionGrid;
