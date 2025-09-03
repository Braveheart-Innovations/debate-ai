import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { Typography } from './Typography';

export interface SegmentedControlOption<T extends string | number> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  fullWidth?: boolean;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, fullWidth }: SegmentedControlProps<T>) {
  const { theme } = useTheme();
  const count = options.length;

  return (
    <View style={{ flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            style={{
              flex: fullWidth ? 1 : undefined,
              paddingVertical: 10,
              paddingHorizontal: 14,
              backgroundColor: selected ? theme.colors.primary[50] : theme.colors.card,
              borderRightWidth: idx < count - 1 ? 1 : 0,
              borderRightColor: theme.colors.border,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Typography variant="body" weight={selected ? 'semibold' : 'medium'} style={{ color: selected ? theme.colors.primary[700] : theme.colors.text.primary }}>
              {opt.label}
            </Typography>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

