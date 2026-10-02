import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { TopicSelector, type TopicSelectorProps } from '@/components/organisms/debate/TopicSelector';
import type { Typography } from '@/components/molecules';

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Button: () => null,
    GradientButton: () => null,
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
  };
});

describe('TopicSelector', () => {
  const defaultProps: TopicSelectorProps = {
    selectedTopic: '',
    customTopic: '',
    topicMode: 'preset' as const,
    showTopicDropdown: false,
    isTopicSelected: false,
    finalTopic: '',
    setSelectedTopic: jest.fn(),
    setCustomTopic: jest.fn(),
    setTopicMode: jest.fn(),
    setShowTopicDropdown: jest.fn(),
    selectRandomTopic: jest.fn(),
    validateCurrentTopic: jest.fn(() => ({ valid: true })),
    reset: jest.fn(),
    onStartDebate: jest.fn(),
  };

  it('renders topic selector', () => {
    const { getByText } = renderWithProviders(<TopicSelector {...defaultProps} />);
    expect(getByText('Choose Your Battle!')).toBeTruthy();
  });
});
