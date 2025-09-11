import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';
import { FilterChipProps } from '../../../types/history';

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  isActive,
  onPress,
  count
}) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: isActive 
            ? theme.colors.primary[100] 
            : theme.colors.surface,
          borderColor: isActive 
            ? theme.colors.primary[500] 
            : theme.colors.border,
        }
      ]}
    >
      <Box style={styles.content}>
        <Typography
          variant="caption"
          weight={isActive ? 'semibold' : 'medium'}
          style={{
            color: isActive 
              ? theme.colors.primary[700] 
              : theme.colors.text.secondary
          }}
        >
          {label}
        </Typography>
        
        {count !== undefined && (
          <Box
            style={[
              styles.countBadge,
              {
                backgroundColor: isActive 
                  ? theme.colors.primary[500] 
                  : theme.colors.text.secondary
              }
            ]}
          >
            <Typography
              variant="caption"
              weight="medium"
              style={{
                color: 'white',
                fontSize: 11,
                lineHeight: 14
              }}
            >
              {count}
            </Typography>
          </Box>
        )}
      </Box>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadge: {
    marginLeft: 6,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
