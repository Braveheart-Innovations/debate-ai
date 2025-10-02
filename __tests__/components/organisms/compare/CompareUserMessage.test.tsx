import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareUserMessage } from '@/components/organisms/compare/CompareUserMessage';
import type { Message } from '@/types';

const mockMessageBubble = jest.fn(() => null);

jest.mock('@/components/organisms/common/MessageBubble', () => ({
  MessageBubble: (props: any) => {
    mockMessageBubble(props);
    return null;
  },
}));

describe('CompareUserMessage', () => {
  it('forwards message to MessageBubble', () => {
    const message: Message = {
      id: 'm1',
      sender: 'User',
      senderType: 'user',
      content: 'Hi there',
      timestamp: 10,
    };

    renderWithProviders(<CompareUserMessage message={message} />);

    expect(mockMessageBubble).toHaveBeenCalledWith(expect.objectContaining({
      message,
      isLast: false,
    }));
  });
});
