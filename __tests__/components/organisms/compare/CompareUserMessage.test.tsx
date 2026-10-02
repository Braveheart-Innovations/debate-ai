import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockMessage } from '@test-utils/fixtures';
import { CompareUserMessage } from '@/components/organisms/compare/CompareUserMessage';
import type { MessageBubble } from '@/components/organisms/common/MessageBubble';

const mockMessageBubble = capturePropsOf<typeof MessageBubble>();

jest.mock('@/components/organisms/common/MessageBubble', () => ({
  get MessageBubble() {
    return mockMessageBubble.Stub;
  },
}));

describe('CompareUserMessage', () => {
  it('forwards message to MessageBubble', () => {
    const message = createMockMessage({
      id: 'm1',
      sender: 'User',
      senderType: 'user',
      content: 'Hi there',
      timestamp: 10,
    });

    renderWithProviders(<CompareUserMessage message={message} />);

    expect(mockMessageBubble.latest()).toEqual(expect.objectContaining({
      message,
      isLast: false,
    }));
  });
});
