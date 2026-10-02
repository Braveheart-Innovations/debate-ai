import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { LinearGradient } from 'expo-linear-gradient';
import type { PropsOf } from '@test-utils/mockComponents';
import { RankBadge } from '@/components/molecules/stats/RankBadge';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: PropsOf<typeof LinearGradient>) => children,
}));

describe('RankBadge', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(<RankBadge rank={1} />);
    expect(result).toBeTruthy();
  });
});
