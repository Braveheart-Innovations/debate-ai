import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { LinearGradient } from 'expo-linear-gradient';
import type { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Typography } from '@/components/molecules';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinearGradient: ({ children }: PropsOf<typeof LinearGradient>) => <View>{children}</View>,
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ children }: PropsOf<typeof MaterialIcons>) => <Text>{children}</Text>,
    MaterialCommunityIcons: ({ children }: PropsOf<typeof MaterialCommunityIcons>) => <Text>{children}</Text>,
  };
});

jest.mock('@/components/molecules', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Typography: ({ children }: PropsOf<typeof Typography>) => <Text>{children}</Text>,
  };
});

describe('UnlockEverythingBanner', () => {
  it('renders key selling points', () => {
    const { getByText } = renderWithProviders(<UnlockEverythingBanner />);

    expect(getByText('Unlock Everything')).toBeTruthy();
    expect(getByText('$5.99/month')).toBeTruthy();
    expect(getByText(/Create Mode/)).toBeTruthy();
  });
});
