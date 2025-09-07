import React from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { HistoryHeaderProps } from '../../../types/history';

export const HistoryHeader: React.FC<HistoryHeaderProps> = ({ title }) => {
  const { theme } = useTheme();

  return (
    <Box style={[
      styles.container,
      { 
        backgroundColor: theme.colors.surface,
        borderBottomColor: theme.colors.border,
      }
    ]}>
      <Typography variant="title" weight="bold">
        {title}
      </Typography>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
