import React from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/components/atoms';
import { Typography, Button } from '@/components/molecules';
import { useTheme } from '@/theme';

export interface APIConfigHeaderProps {
  onBack: () => void;
  title?: string;
  testID?: string;
}

export const APIConfigHeader: React.FC<APIConfigHeaderProps> = ({
  onBack,
  title = 'API Configuration',
  testID,
}) => {
  const { theme } = useTheme();

  return (
    <Box 
      style={[
        styles.header,
        { 
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        }
      ]}
      testID={testID}
    >
      <Button 
        title="←"
        onPress={onBack}
        variant="ghost"
        style={styles.backButton}
      />
      
      <Box style={styles.titleContainer}>
        <Typography variant="title" weight="bold">
          {title}
        </Typography>
      </Box>
      
      <Box style={styles.rightSpacer} />
    </Box>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    borderWidth: 0,
    minWidth: 44,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  rightSpacer: {
    width: 44,
  },
});
