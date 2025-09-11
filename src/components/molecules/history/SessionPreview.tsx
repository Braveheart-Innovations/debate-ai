import React from 'react';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';
import { SessionPreviewProps } from '../../../types/history';

export const SessionPreview: React.FC<SessionPreviewProps> = ({
  text,
  searchTerm,
  maxLines = 2,
  style
}) => {
  const { theme } = useTheme();
  
  // If no search term, render normal text
  if (!searchTerm) {
    return (
      <Typography 
        style={style} 
        color="secondary" 
        variant="body"
        numberOfLines={maxLines}
      >
        {text}
      </Typography>
    );
  }

  // Split text and highlight search terms
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <Typography 
      style={style} 
      color="secondary" 
      variant="body"
      numberOfLines={maxLines}
    >
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === searchTerm.toLowerCase();
        
        return isMatch ? (
          <Typography 
            key={index} 
            style={{ 
              backgroundColor: theme.colors.warning[50], 
              fontWeight: '600',
              color: theme.colors.warning[700]
            }}
          >
            {part}
          </Typography>
        ) : (
          part
        );
      })}
    </Typography>
  );
};
