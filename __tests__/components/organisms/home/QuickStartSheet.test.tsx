import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { QuickStartSheet } from '@/components/organisms/home/QuickStartSheet';
import { QUICK_START_TEMPLATES } from '@/config/quickStartTemplates';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

describe('QuickStartSheet', () => {
  const defaultProps = {
    visible: true,
    templates: QUICK_START_TEMPLATES,
    onClose: jest.fn(),
    onStart: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders starters and initial preview when visible', () => {
    const { getByText } = renderWithProviders(<QuickStartSheet {...defaultProps} />);

    expect(getByText('Quick Start')).toBeTruthy();
    expect(getByText('Direct Answer')).toBeTruthy();
    expect(getByText('Troubleshoot')).toBeTruthy();
    expect(getByText('Enter a prompt to preview the first message.')).toBeTruthy();
  });

  it('does not render content when hidden', () => {
    const { queryByText } = renderWithProviders(<QuickStartSheet {...defaultProps} visible={false} />);

    expect(queryByText('Quick Start')).toBeNull();
  });

  it('puts prompt entry first and previews the exact user message', () => {
    const { getByTestId, getByPlaceholderText, getByText } = renderWithProviders(
      <QuickStartSheet {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('What do you want to talk through?'),
      'privacy-first family calendar ideas',
    );
    fireEvent.press(getByTestId('quick-start-template-brainstorm'));

    expect(getByText('privacy-first family calendar ideas')).toBeTruthy();
  });

  it('does not start without user-entered prompt text', () => {
    const onStart = jest.fn();
    const { getByText } = renderWithProviders(
      <QuickStartSheet {...defaultProps} onStart={onStart} />,
    );

    fireEvent.press(getByText('Start Chat'));

    expect(onStart).not.toHaveBeenCalled();
  });

  it('closes without starting when backdrop is pressed', () => {
    const onClose = jest.fn();
    const onStart = jest.fn();
    const { getByTestId } = renderWithProviders(
      <QuickStartSheet {...defaultProps} onClose={onClose} onStart={onStart} />,
    );

    fireEvent.press(getByTestId('quick-start-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('starts with generated prompt payload after selection', () => {
    const onStart = jest.fn();
    const { getByTestId, getByPlaceholderText, getByText } = renderWithProviders(
      <QuickStartSheet {...defaultProps} onStart={onStart} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('What do you want to talk through?'),
      'a freemium launch plan',
    );
    fireEvent.press(getByTestId('quick-start-template-plan'));
    fireEvent.press(getByText('Start Chat'));

    expect(onStart).toHaveBeenCalledWith({
      templateId: 'plan',
      userPrompt: 'a freemium launch plan',
      aiPrompt: expect.stringContaining('a freemium launch plan'),
    });
  });
});
