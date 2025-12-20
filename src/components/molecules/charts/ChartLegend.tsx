import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Typography } from '../common/Typography';

export interface LegendItem {
  color: string;
  label: string;
  value?: string | number;
}

export interface ChartLegendProps {
  items: LegendItem[];
  orientation?: 'horizontal' | 'vertical';
  onItemPress?: (index: number) => void;
  showValues?: boolean;
  testID?: string;
}

/**
 * ChartLegend - A component to display chart legend items
 */
export const ChartLegend: React.FC<ChartLegendProps> = ({
  items,
  orientation = 'horizontal',
  onItemPress,
  showValues = true,
  testID,
}) => {
  if (items.length === 0) {
    return null;
  }

  const isHorizontal = orientation === 'horizontal';

  return (
    <View
      style={[
        styles.container,
        isHorizontal ? styles.horizontal : styles.vertical,
      ]}
      testID={testID}
    >
      {items.map((item, index) => {
        const content = (
          <View
            style={[
              styles.item,
              isHorizontal ? styles.itemHorizontal : styles.itemVertical,
            ]}
          >
            {/* Color indicator */}
            <View
              style={[
                styles.colorIndicator,
                { backgroundColor: item.color },
              ]}
            />

            {/* Label */}
            <Typography
              variant="caption"
              weight="medium"
              style={styles.label}
              numberOfLines={1}
            >
              {item.label}
            </Typography>

            {/* Value (optional) */}
            {showValues && item.value !== undefined && (
              <Typography
                variant="caption"
                weight="bold"
                color="secondary"
                style={styles.value}
              >
                {typeof item.value === 'number' ? item.value.toFixed(item.value % 1 === 0 ? 0 : 1) : item.value}
              </Typography>
            )}
          </View>
        );

        if (onItemPress) {
          return (
            <TouchableOpacity
              key={`legend-${index}`}
              onPress={() => onItemPress(index)}
              activeOpacity={0.7}
              style={isHorizontal ? styles.touchableHorizontal : styles.touchableVertical}
            >
              {content}
            </TouchableOpacity>
          );
        }

        return (
          <View
            key={`legend-${index}`}
            style={isHorizontal ? styles.touchableHorizontal : styles.touchableVertical}
          >
            {content}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexWrap: 'wrap',
  },
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertical: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemHorizontal: {
    marginRight: 16,
    marginBottom: 4,
  },
  itemVertical: {
    marginBottom: 8,
  },
  touchableHorizontal: {
    marginRight: 8,
  },
  touchableVertical: {
    width: '100%',
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  label: {
    marginRight: 4,
  },
  value: {
    marginLeft: 2,
  },
});

export default ChartLegend;
