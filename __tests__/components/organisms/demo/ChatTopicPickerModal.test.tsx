import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ChatTopicPickerModal } from '@/components/organisms/demo/ChatTopicPickerModal';

// Mock DemoContentService
const mockListChatSamples = jest.fn();
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listChatSamples: (...args: any[]) => mockListChatSamples(...args),
    subscribe: (...args: any[]) => mockSubscribe(...args),
  },
}));

// Mock expo modules
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
  Ionicons: () => null,
};
});

// Mock molecules
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View, TextInput } = require('react-native');
  return {
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(Text, { testID }, children),
    Button: ({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) =>
      React.createElement(TouchableOpacity, { onPress, testID: testID || 'button' }, React.createElement(Text, null, title)),
    SheetHeader: ({ title, onClose, testID }: any) =>
      React.createElement(
        View,
        { testID: testID || 'sheet-header' },
        React.createElement(Text, null, title),
        React.createElement(TouchableOpacity, { onPress: onClose, testID: 'sheet-header-close' }, React.createElement(Text, null, 'Close'))
      ),
    InputField: ({ placeholder, value, onChangeText, testID }: any) =>
      React.createElement(TextInput, { placeholder, value, onChangeText, testID: testID || 'input-field' }),
  };
});

describe('ChatTopicPickerModal', () => {
  const mockOnSelect = jest.fn();
  const mockOnClose = jest.fn();
  const providers = ['openai', 'anthropic'];

  const sampleTopics = [
    { id: 'chat_o_1', title: 'Philosophy Discussion' },
    { id: 'chat_o_2', title: 'Tech Trends 2024' },
    { id: 'chat_o_3', title: 'Creative Writing' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockListChatSamples.mockResolvedValue(sampleTopics);
  });

  describe('Rendering', () => {
    it('renders without crashing when visible', async () => {
      const result = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(result).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const { queryByText } = renderWithProviders(
        <ChatTopicPickerModal visible={false} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Choose a Chat Topic')).toBeNull();
    });

    it('renders the sheet header with correct title', () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Choose a Chat Topic')).toBeTruthy();
    });

    it('renders loaded sample topics', async () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText('Philosophy Discussion')).toBeTruthy();
        expect(getByText('Tech Trends 2024')).toBeTruthy();
        expect(getByText('Creative Writing')).toBeTruthy();
      });
    });

    it('renders topic IDs below titles', async () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText('chat_o_1')).toBeTruthy();
        expect(getByText('chat_o_2')).toBeTruthy();
        expect(getByText('chat_o_3')).toBeTruthy();
      });
    });

    it('does not render "New sample" button by default', () => {
      const { queryByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText(/New sample/i)).toBeNull();
    });

    it('renders "New sample" button when allowNewSample is true', () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      expect(getByText(/＋ New sample/i)).toBeTruthy();
    });
  });

  describe('Persona Display', () => {
    it('displays persona when personaId and single provider are provided', () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={['openai']} personaId="sage" onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText(/Persona: sage/i)).toBeTruthy();
    });

    it('displays "Default" for default persona', () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={['openai']} personaId="default" onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText(/Persona: Default/i)).toBeTruthy();
    });

    it('does not display persona when multiple providers', () => {
      const { queryByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} personaId="sage" onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText(/Persona:/i)).toBeNull();
    });

    it('does not display persona when personaId is not provided', () => {
      const { queryByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={['openai']} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText(/Persona:/i)).toBeNull();
    });
  });

  describe('Data Loading', () => {
    it('calls DemoContentService.listChatSamples when visible', async () => {
      renderWithProviders(<ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />);
      await waitFor(() => {
        expect(mockListChatSamples).toHaveBeenCalledWith(providers);
      });
    });

    it('subscribes to DemoContentService updates', () => {
      renderWithProviders(<ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />);
      expect(mockSubscribe).toHaveBeenCalled();
    });

    it('unsubscribes on unmount', () => {
      const { unmount } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('handles empty sample list', async () => {
      mockListChatSamples.mockResolvedValue([]);
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText(/No topics available for this combination/i)).toBeTruthy();
      });
    });

    it('handles service error gracefully', async () => {
      mockListChatSamples.mockRejectedValue(new Error('Service error'));
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText(/No topics available/i)).toBeTruthy();
      });
    });

    it('does not call service when not visible', () => {
      mockListChatSamples.mockClear();
      renderWithProviders(<ChatTopicPickerModal visible={false} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />);
      expect(mockListChatSamples).not.toHaveBeenCalled();
    });
  });

  describe('User Interactions', () => {
    it('calls onSelect when a topic is pressed', async () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText('Philosophy Discussion')).toBeTruthy();
      });
      fireEvent.press(getByText('Philosophy Discussion'));
      expect(mockOnSelect).toHaveBeenCalledWith('chat_o_1', 'Philosophy Discussion');
    });

    it('calls onSelect with correct topic data', async () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText('Tech Trends 2024')).toBeTruthy();
      });
      fireEvent.press(getByText('Tech Trends 2024'));
      expect(mockOnSelect).toHaveBeenCalledWith('chat_o_2', 'Tech Trends 2024');
    });

    it('calls onClose when sheet header close is pressed', () => {
      const { getByTestId } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByTestId('sheet-header-close'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('New Sample Creation', () => {
    it('shows form when "New sample" button is pressed', () => {
      const { getByText, getAllByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      expect(getByText(/Enter a unique ID and title/i)).toBeTruthy();
      expect(getAllByPlaceholderText(/e.g./i).length).toBeGreaterThan(0);
    });

    it('hides "New sample" button when form is shown', () => {
      const { getByText, queryByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      expect(queryByText(/＋ New sample/i)).toBeNull();
    });

    it('renders ID and title input fields in form', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      expect(getByPlaceholderText(/chat_o_custom_v1/i)).toBeTruthy();
      expect(getByPlaceholderText(/Custom Kyoto itinerary/i)).toBeTruthy();
    });

    it('allows typing in ID field', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      const idInput = getByPlaceholderText(/chat_o_custom_v1/i);
      fireEvent.changeText(idInput, 'my_custom_chat');
      expect(idInput.props.value).toBe('my_custom_chat');
    });

    it('allows typing in title field', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      const titleInput = getByPlaceholderText(/Custom Kyoto itinerary/i);
      fireEvent.changeText(titleInput, 'My Custom Title');
      expect(titleInput.props.value).toBe('My Custom Title');
    });

    it('closes form when Cancel is pressed', () => {
      const { getByText, queryByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      expect(getByText(/Enter a unique ID/i)).toBeTruthy();
      fireEvent.press(getByText('Cancel'));
      expect(queryByText(/Enter a unique ID/i)).toBeNull();
      expect(getByText(/＋ New sample/i)).toBeTruthy();
    });

    it('calls onSelect with "new:" prefix when Create & Start is pressed', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      fireEvent.changeText(getByPlaceholderText(/chat_o_custom_v1/i), 'my_chat');
      fireEvent.changeText(getByPlaceholderText(/Custom Kyoto itinerary/i), 'My Title');
      fireEvent.press(getByText('Create & Start'));
      expect(mockOnSelect).toHaveBeenCalledWith('new:my_chat', 'My Title');
    });

    it('uses ID as title when title is empty', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      fireEvent.changeText(getByPlaceholderText(/chat_o_custom_v1/i), 'my_chat');
      fireEvent.press(getByText('Create & Start'));
      expect(mockOnSelect).toHaveBeenCalledWith('new:my_chat', 'my_chat');
    });

    it('does not call onSelect when ID is empty', () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      fireEvent.press(getByText('Create & Start'));
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('trims whitespace from ID and title', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      fireEvent.changeText(getByPlaceholderText(/chat_o_custom_v1/i), '  my_chat  ');
      fireEvent.changeText(getByPlaceholderText(/Custom Kyoto itinerary/i), '  My Title  ');
      fireEvent.press(getByText('Create & Start'));
      expect(mockOnSelect).toHaveBeenCalledWith('new:my_chat', 'My Title');
    });

    it('clears form when Cancel is pressed', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      const idInput = getByPlaceholderText(/chat_o_custom_v1/i);
      const titleInput = getByPlaceholderText(/Custom Kyoto itinerary/i);
      fireEvent.changeText(idInput, 'test_id');
      fireEvent.changeText(titleInput, 'Test Title');
      fireEvent.press(getByText('Cancel'));
      fireEvent.press(getByText(/＋ New sample/i));
      expect(getByPlaceholderText(/chat_o_custom_v1/i).props.value).toBe('');
      expect(getByPlaceholderText(/Custom Kyoto itinerary/i).props.value).toBe('');
    });
  });

  describe('Props Handling', () => {
    it('works with different onSelect callback', async () => {
      const alternateOnSelect = jest.fn();
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={alternateOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText('Philosophy Discussion')).toBeTruthy();
      });
      fireEvent.press(getByText('Philosophy Discussion'));
      expect(alternateOnSelect).toHaveBeenCalledTimes(1);
    });

    it('works with different onClose callback', () => {
      const alternateOnClose = jest.fn();
      const { getByTestId } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={alternateOnClose} />
      );
      fireEvent.press(getByTestId('sheet-header-close'));
      expect(alternateOnClose).toHaveBeenCalledTimes(1);
    });

    it('handles allowNewSample prop defaulting to false', () => {
      const { queryByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText(/New sample/i)).toBeNull();
    });

    it('reloads data when providers change', async () => {
      mockListChatSamples.mockClear();
      const { rerender } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={['openai']} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(mockListChatSamples).toHaveBeenCalledWith(['openai']);
      });

      mockListChatSamples.mockClear();
      rerender(<ChatTopicPickerModal visible={true} providers={['anthropic']} onSelect={mockOnSelect} onClose={mockOnClose} />);
      await waitFor(() => {
        expect(mockListChatSamples).toHaveBeenCalledWith(['anthropic']);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid successive topic presses', async () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText('Philosophy Discussion')).toBeTruthy();
      });
      const topic = getByText('Philosophy Discussion');
      for (let i = 0; i < 5; i++) {
        fireEvent.press(topic);
      }
      expect(mockOnSelect).toHaveBeenCalledTimes(5);
    });

    it('renders with noop callbacks', () => {
      const noopOnSelect = () => {};
      const noopOnClose = () => {};
      const result = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={noopOnSelect} onClose={noopOnClose} />
      );
      expect(result).toBeTruthy();
    });

    it('closes creation form when allowNewSample becomes false', () => {
      const { getByText, queryByText, rerender } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      fireEvent.press(getByText(/＋ New sample/i));
      expect(getByText(/Enter a unique ID/i)).toBeTruthy();

      rerender(<ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={false} />);
      expect(queryByText(/Enter a unique ID/i)).toBeNull();
    });

    it('handles topic with very long title', async () => {
      mockListChatSamples.mockResolvedValue([
        { id: 'chat_long', title: 'This is a very long topic title that might wrap across multiple lines in the UI' },
      ]);
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(getByText(/This is a very long topic title/)).toBeTruthy();
      });
    });

    it('handles single provider', async () => {
      const { getByText } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={['openai']} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(mockListChatSamples).toHaveBeenCalledWith(['openai']);
      });
    });
  });

  describe('Snapshot Tests', () => {
    it('matches snapshot with topics', async () => {
      const { toJSON } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      await waitFor(() => {
        expect(toJSON()).toMatchSnapshot();
      });
    });

    it('matches snapshot with new sample option', () => {
      const { toJSON } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={providers} onSelect={mockOnSelect} onClose={mockOnClose} allowNewSample={true} />
      );
      expect(toJSON()).toMatchSnapshot();
    });

    it('matches snapshot with persona', () => {
      const { toJSON } = renderWithProviders(
        <ChatTopicPickerModal visible={true} providers={['openai']} personaId="sage" onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(toJSON()).toMatchSnapshot();
    });
  });
});
