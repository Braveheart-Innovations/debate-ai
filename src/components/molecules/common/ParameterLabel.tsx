import React from 'react';
import { View } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '@/theme';

interface ParameterLabelProps {
  name: string;
  value: number | string;
  description?: string;
}

export const ParameterLabel: React.FC<ParameterLabelProps> = ({
  name,
  value,
  description,
}) => {
  const { theme } = useTheme();
  
  const formatName = (str: string) => {
    return str.charAt(0).toUpperCase() + 
           str.slice(1).replace(/([A-Z])/g, ' $1').trim();
  };
  
  return (
    <View>
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.xs,
      }}>
        <Typography variant="subtitle" weight="semibold">
          {formatName(name)}
        </Typography>
        <Typography variant="body" color="brand" weight="bold">
          {value}
        </Typography>
      </View>
      {description && (
        <Typography variant="caption" color="secondary">
          {description}
        </Typography>
      )}
    </View>
  );
};
