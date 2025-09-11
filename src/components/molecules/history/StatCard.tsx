import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';
import { StatCardProps } from '../../../types/history';

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color,
  onPress
}) => {
  const { theme } = useTheme();
  
  const cardColor = color || theme.colors.primary[500];
  const isInteractive = !!onPress;

  const content = (
    <Box 
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
        }
      ]}
    >
      {/* Icon */}
      {icon && (
        <Box 
          style={[
            styles.iconContainer,
            { backgroundColor: `${cardColor}20` }
          ]}
        >
          <Typography
            variant="title"
            style={{
              color: cardColor,
              fontSize: 20,
              textAlign: 'center'
            }}
          >
            {icon}
          </Typography>
        </Box>
      )}

      {/* Content */}
      <Box style={styles.content}>
        <Typography
          variant="title"
          weight="bold"
          style={{
            color: cardColor,
            fontSize: 24,
            marginBottom: 2
          }}
        >
          {value}
        </Typography>
        
        <Typography
          variant="subtitle"
          weight="medium"
          numberOfLines={1}
          style={{ marginBottom: subtitle ? 2 : 0 }}
        >
          {title}
        </Typography>
        
        {subtitle && (
          <Typography
            variant="caption"
            color="secondary"
            numberOfLines={2}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  );

  if (isInteractive) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.touchable}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
  },
  container: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 100,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
  },
});
