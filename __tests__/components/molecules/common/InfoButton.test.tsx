import { fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { InfoButton } from '@/components/molecules/common/InfoButton';
import type { HelpTopicId } from '@/config/help/types';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

describe('InfoButton', () => {
  describe('rendering', () => {
    it('renders correctly', () => {
      const { getByRole } = renderWithProviders(
        <InfoButton topicId="byok-getting-keys" />
      );
      expect(getByRole('button')).toBeTruthy();
    });

    it('has correct accessibility label', () => {
      const { getByLabelText } = renderWithProviders(
        <InfoButton topicId="byok-overview" />
      );
      expect(getByLabelText('Help information')).toBeTruthy();
    });

    it('has correct accessibility hint', () => {
      const { getByRole } = renderWithProviders(
        <InfoButton topicId="personalities" />
      );
      const button = getByRole('button');
      expect(button.props.accessibilityHint).toContain('Opens help for');
    });

    it('renders with testID when provided', () => {
      const { getByTestId } = renderWithProviders(
        <InfoButton topicId="debate-arena" testID="info-btn" />
      );
      expect(getByTestId('info-btn')).toBeTruthy();
    });
  });

  describe('size prop', () => {
    it('renders with small size (default)', () => {
      const { getByRole } = renderWithProviders(
        <InfoButton topicId="byok-getting-keys" size="small" />
      );
      expect(getByRole('button')).toBeTruthy();
    });

    it('renders with medium size', () => {
      const { getByRole } = renderWithProviders(
        <InfoButton topicId="byok-getting-keys" size="medium" />
      );
      expect(getByRole('button')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls haptic feedback when pressed', () => {
      const { getByRole } = renderWithProviders(
        <InfoButton topicId="byok-getting-keys" />
      );
      fireEvent.press(getByRole('button'));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(
        Haptics.ImpactFeedbackStyle.Light
      );
    });

    it('dispatches showSheet action when pressed', () => {
      const { getByRole, store } = renderWithProviders(
        <InfoButton topicId="expert-mode" />
      );
      fireEvent.press(getByRole('button'));
      // The action should have been dispatched
      const state = store.getState();
      expect(state.navigation.activeSheet).toBe('help');
    });
  });

  describe('topicId variations', () => {
    const topicIds: HelpTopicId[] = [
      'byok-getting-keys',
      'byok-overview',
      'expert-mode',
      'debate-arena',
      'personalities',
    ];

    topicIds.forEach((topicId) => {
      it(`renders with topicId: ${topicId}`, () => {
        const { getByRole } = renderWithProviders(
          <InfoButton topicId={topicId} />
        );
        expect(getByRole('button')).toBeTruthy();
      });
    });
  });
});
