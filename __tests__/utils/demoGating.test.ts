import { Alert } from 'react-native';
import { showTrialCTA } from '@/utils/demoGating';

jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

describe('demoGating', () => {
  afterEach(() => {
    (Alert.alert as jest.Mock).mockClear();
  });

  it('uses default messaging when no options provided', () => {
    const navigate = jest.fn();
    showTrialCTA(navigate);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Demo Mode',
      'This action requires a Free Trial to enable live AI access.',
      expect.arrayContaining([{ text: 'Not now', style: 'cancel' }, expect.objectContaining({ text: 'Start 7‑Day Free Trial' })]),
    );
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    buttons[1].onPress?.();
    expect(navigate).toHaveBeenCalledWith('Subscription');
  });

  it('supports custom messaging', () => {
    const navigate = jest.fn();
    showTrialCTA(navigate, { title: 'Custom', message: 'Need trial', ctaText: 'Upgrade Now' });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Custom',
      'Need trial',
      expect.arrayContaining([expect.objectContaining({ text: 'Upgrade Now' })]),
    );
  });
});
