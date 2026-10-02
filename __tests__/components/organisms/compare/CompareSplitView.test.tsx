import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareSplitView } from '@/components/organisms/compare/CompareSplitView';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockAIConfig, createMockAIMessage } from '@test-utils/fixtures';
import type { CompareResponsePane } from '@/components/organisms/compare/CompareResponsePane';

const mockResponsePane = capturePropsOf<typeof CompareResponsePane>((props) => (
  <Text testID={`pane-${props.side}`}>{props.ai.name}</Text>
));

jest.mock('@/components/organisms/compare/CompareResponsePane', () => ({
  get CompareResponsePane() {
    return mockResponsePane.Stub;
  },
}));

const baseAI = createMockAIConfig({
  id: 'ai',
  name: 'Test AI',
  provider: 'claude',
  model: 'haiku',
});

const leftAI = { ...baseAI, id: 'left', name: 'Left AI' };
const rightAI = { ...baseAI, id: 'right', name: 'Right AI' };

const messages = [
  createMockAIMessage({ id: 'm1', sender: 'Left', content: 'Hi', timestamp: 1 }),
];

describe('CompareSplitView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResponsePane.reset();
  });

  it('renders both panes in split view', () => {
    const onReportContent = jest.fn();
    const { getByTestId } = renderWithProviders(
      <CompareSplitView
        leftAI={leftAI}
        rightAI={rightAI}
        leftMessages={messages}
        rightMessages={messages}
        leftTyping={false}
        rightTyping={true}
        onContinueWithLeft={jest.fn()}
        onContinueWithRight={jest.fn()}
        viewMode="split"
        continuedSide={null}
        onExpandLeft={jest.fn()}
        onExpandRight={jest.fn()}
        onOpenLightbox={jest.fn()}
        onReportContent={onReportContent}
      />
    );

    expect(getByTestId('pane-left')).toBeTruthy();
    expect(getByTestId('pane-right')).toBeTruthy();
    expect(mockResponsePane.calls[0]).toEqual(expect.objectContaining({ side: 'left', isExpanded: false, onReportContent }));
    expect(mockResponsePane.calls[1]).toEqual(expect.objectContaining({ side: 'right', isExpanded: false, isDisabled: false, onReportContent }));
  });

  it('renders only left pane in left-only mode', () => {
    const { queryByTestId } = renderWithProviders(
      <CompareSplitView
        leftAI={leftAI}
        rightAI={rightAI}
        leftMessages={messages}
        rightMessages={messages}
        leftTyping={false}
        rightTyping={false}
        onContinueWithLeft={jest.fn()}
        onContinueWithRight={jest.fn()}
        viewMode="left-only"
        continuedSide="left"
        onExpandLeft={jest.fn()}
        onExpandRight={jest.fn()}
        onOpenLightbox={jest.fn()}
      />
    );

    expect(queryByTestId('pane-left')).toBeTruthy();
    expect(queryByTestId('pane-right')).toBeNull();
  });

  it('expands right pane in right-full mode', () => {
    renderWithProviders(
      <CompareSplitView
        leftAI={leftAI}
        rightAI={rightAI}
        leftMessages={messages}
        rightMessages={messages}
        leftTyping={false}
        rightTyping={false}
        onContinueWithLeft={jest.fn()}
        onContinueWithRight={jest.fn()}
        viewMode="right-full"
        continuedSide="left"
        onExpandLeft={jest.fn()}
        onExpandRight={jest.fn()}
        onOpenLightbox={jest.fn()}
      />
    );

    expect(mockResponsePane.latest()).toEqual(expect.objectContaining({ side: 'right', isExpanded: true, isDisabled: true }));
  });

  // Note: Image state props tests removed - image generation moved to Create mode
});
