import React from 'react';
import { StyleSheet, Linking } from 'react-native';
import { Box } from '@/components/atoms';
import { Typography, Button } from '@/components/molecules';
import { useTheme } from '@/theme';
import { CrashlyticsService } from '@/services/crashlytics';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 'fatal' shows full-screen error, 'recoverable' allows retry */
  level?: 'fatal' | 'recoverable';
  /** Show a button to report the issue */
  showReportButton?: boolean;
}

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  level?: 'fatal' | 'recoverable';
  showReportButton?: boolean;
}

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
  level = 'recoverable',
  showReportButton = false,
}) => {
  const { theme } = useTheme();

  const handleReportIssue = () => {
    const subject = encodeURIComponent('Symposium AI Error Report');
    const body = encodeURIComponent(
      `Error: ${error.message}\n\nPlease describe what you were doing when this error occurred:\n\n`
    );
    Linking.openURL(`mailto:support@symposiumai.app?subject=${subject}&body=${body}`);
  };

  const isFatal = level === 'fatal';
  const title = isFatal ? 'App Error' : 'Something went wrong';
  const message = isFatal
    ? 'The app encountered a critical error. Please restart the app.'
    : 'An unexpected error occurred. Please try again.';

  return (
    <Box style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Typography style={styles.emoji}>
        {isFatal ? '💥' : '😔'}
      </Typography>

      <Typography
        variant="title"
        align="center"
        style={styles.title}
      >
        {title}
      </Typography>

      <Typography
        variant="body"
        color="secondary"
        align="center"
        style={styles.message}
      >
        {message}
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

      <Box style={styles.buttonContainer}>
        {!isFatal && (
          <Button
            title="Try Again"
            onPress={resetError}
            variant="primary"
            style={styles.retryButton}
          />
        )}

        {showReportButton && (
          <Button
            title="Report Issue"
            onPress={handleReportIssue}
            variant={isFatal ? 'primary' : 'secondary'}
            style={styles.reportButton}
          />
        )}
      </Box>
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

    // Record error to Crashlytics
    CrashlyticsService.recordError(error, {
      componentStack: errorInfo.componentStack || 'unknown',
      level: this.props.level || 'recoverable',
      type: 'react_error_boundary',
    });

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
          level={this.props.level}
          showReportButton={this.props.showReportButton}
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
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    minWidth: 120,
  },
  reportButton: {
    minWidth: 120,
  },
});
