import React from 'react';
import { Typography } from './Typography';
import { useTheme } from '@/theme';

export interface SearchHighlightProps {
  text: string;
  searchTerm?: string;
}

export const SearchHighlight: React.FC<SearchHighlightProps> = ({ 
  text, 
  searchTerm 
}) => {
  const { theme } = useTheme();
  
  if (!searchTerm) {
    return <>{text}</>;
  }
  
  const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
  
  return (
    <>
      {parts.map((part, index) => {
        if (part.toLowerCase() === searchTerm.toLowerCase()) {
          return (
            <Typography 
              key={index} 
              style={{ 
                backgroundColor: theme.colors.warning[50], 
                fontWeight: '600' 
              }}
            >
              {part}
            </Typography>
          );
        }
        return part;
      })}
    </>
  );
};
