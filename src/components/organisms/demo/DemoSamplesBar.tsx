import React from 'react';
import { ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';

export interface DemoSampleItem {
  id: string;
  title: string;
}

interface DemoSamplesBarProps {
  label?: string;
  samples: DemoSampleItem[];
  onSelect: (id: string) => void;
}

export const DemoSamplesBar: React.FC<DemoSamplesBarProps> = ({ label = 'Samples', samples, onSelect }) => {
  const { theme } = useTheme();
  if (!samples || samples.length === 0) return null;
  return (
    <View style={[styles.container, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
      <Typography variant="caption" weight="semibold" style={{ marginBottom: 6 }}>{label}</Typography>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {samples.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => onSelect(s.id)}
            style={[styles.pill, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          >
            <Typography variant="caption" numberOfLines={1}>{s.title}</Typography>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
});

export default DemoSamplesBar;

