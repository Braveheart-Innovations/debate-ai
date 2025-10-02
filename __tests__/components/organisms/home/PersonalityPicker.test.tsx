import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PersonalityPicker } from '@/components/organisms/home/PersonalityPicker';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockBadge = jest.fn(({ onPress, personalityName }: any) => (
  <TouchableOpacity testID="personality-badge" onPress={onPress}>
    <Text>{personalityName}</Text>
  </TouchableOpacity>
 ));

const mockModal = jest.fn(() => null);

jest.mock('@/components/organisms/home/PersonalityBadge', () => ({
  PersonalityBadge: (props: any) => mockBadge(props),
}));

jest.mock('@/components/organisms/debate/PersonalityModal', () => ({
  PersonalityModal: (props: any) => {
    mockModal(props);
    return null;
  },
}));

jest.mock('@/config/personalities', () => ({
  UNIVERSAL_PERSONALITIES: [
    { id: 'default', name: 'Default', signatureMoves: [], sampleOpeners: {}, bio: '', tagline: '', emoji: '🙂' },
    { id: 'scholar', name: 'Scholar', signatureMoves: ['Research'], sampleOpeners: { chat: 'Hello' }, bio: 'Curious', tagline: 'Thoughtful', emoji: '📚' },
  ],
  getPersonality: jest.fn(),
}));

describe('PersonalityPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens modal and returns selected personality', () => {
    const onSelect = jest.fn();

    const { getByTestId } = renderWithProviders(
      <PersonalityPicker
        currentPersonalityId="default"
        onSelectPersonality={onSelect}
        aiName="Claude"
      />
    );

    fireEvent.press(getByTestId('personality-badge'));
    expect(mockModal).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));

    const modalProps = mockModal.mock.calls[mockModal.mock.calls.length - 1][0];
    modalProps.onConfirm('scholar');

    expect(onSelect).toHaveBeenCalledWith('scholar');
    expect(require('expo-haptics').impactAsync).toHaveBeenCalled();
  });
});
