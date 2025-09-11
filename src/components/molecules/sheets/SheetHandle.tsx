import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';

interface SheetHandleProps {
  width?: number;
  height?: number;
  marginBottom?: number;
}

export const SheetHandle: React.FC<SheetHandleProps> = ({
  width = 36,
  height = 4,
  marginBottom = 16,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { marginBottom }]}>
      <View 
        style={[
          styles.handle,
          {
            width,
            height,
            backgroundColor: theme.colors.text.secondary,
            borderRadius: height / 2,
          }
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 8,
  },
  handle: {
    opacity: 0.3,
  },
});
