import { Alert } from 'react-native';

export function showTrialCTA(
  navigate: (screen: string, params?: Record<string, unknown>) => void,
  opts?: { title?: string; message?: string; ctaText?: string }
) {
  const title = opts?.title || 'Demo Mode';
  const message = opts?.message || 'This action requires a Free Trial to enable live AI access.';
  const ctaText = opts?.ctaText || 'Start 7‑Day Free Trial';
  Alert.alert(
    title,
    message,
    [
      { text: 'Not now', style: 'cancel' },
      { text: ctaText, onPress: () => navigate('Subscription') },
    ]
  );
}

