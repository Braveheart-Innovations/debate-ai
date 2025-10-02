import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareSplitView } from '@/components/organisms/compare/CompareSplitView';
import type { AIConfig, Message } from '@/types';

const mockResponsePane = jest.fn((props: any) => (
  <Text testID={`pane-${props.side}`}>{props.ai.name}</Text>
));

jest.mock('@/components/organisms/compare/CompareResponsePane', () => ({
  CompareResponsePane: (props: any) => mockResponsePane(props),
}));

const baseAI: AIConfig = {
  id: 'ai',
  name: 'Test AI',
  provider: 'claude',
  model: 'haiku',
};

const leftAI: AIConfig = { ...baseAI, id: 'left', name: 'Left AI' };
const rightAI: AIConfig = { ...baseAI, id: 'right', name: 'Right AI' };

const messages: Message[] = [
  { id: 'm1', sender: 'Left', senderType: 'ai', content: 'Hi', timestamp: 1 },
];

describe('CompareSplitView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders both panes in split view', () => {
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
      />
    );

    expect(getByTestId('pane-left')).toBeTruthy();
    expect(getByTestId('pane-right')).toBeTruthy();
    expect(mockResponsePane).toHaveBeenNthCalledWith(1, expect.objectContaining({ side: 'left', isExpanded: false }));
    expect(mockResponsePane).toHaveBeenNthCalledWith(2, expect.objectContaining({ side: 'right', isExpanded: false, isDisabled: false }));
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
      />
    );

    const lastCall = mockResponsePane.mock.calls.pop();
    expect(lastCall?.[0]).toEqual(expect.objectContaining({ side: 'right', isExpanded: true, isDisabled: true }));
  });
});
