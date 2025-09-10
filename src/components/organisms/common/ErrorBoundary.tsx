import React from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/components/atoms';
import { Typography, Button } from '@/components/molecules';
import { useTheme } from '@/theme';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetError }) => {
  const { theme } = useTheme();

  return (
    <Box style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Typography style={styles.emoji}>
        😔
      </Typography>
      
      <Typography 
        variant="title" 
        align="center" 
        style={styles.title}
      >
        Something went wrong
      </Typography>
      
      <Typography 
        variant="body" 
        color="secondary" 
        align="center"
        style={styles.message}
      >
        An unexpected error occurred. Please try again.
      </Typography>

      {__DEV__ && error.message && (
        <Box style={styles.errorContainer}>
          <Typography 
            variant="caption" 
            color="secondary" 
            align="center"
            style={styles.errorMessage}
          >
            {error.message}
          </Typography>
        </Box>
      )}

      <Button
        title="Try Again"
        onPress={resetError}
        variant="primary"
        style={styles.retryButton}
      />
    </Box>
  );
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      
      return (
        <FallbackComponent 
          error={this.state.error || new Error('Unknown error')}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    marginBottom: 8,
  },
  message: {
    marginBottom: 24,
    lineHeight: 20,
  },
  errorContainer: {
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  errorMessage: {
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  retryButton: {
    minWidth: 120,
  },
});
