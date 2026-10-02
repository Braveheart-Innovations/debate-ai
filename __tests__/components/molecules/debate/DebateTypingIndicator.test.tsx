import type { LinearGradient } from 'expo-linear-gradient';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateTypingIndicator } from '@/components/molecules/debate/DebateTypingIndicator';
import type { Button, Card, GlassCard, Typography } from '@/components/molecules';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    LinearGradient: stubComponent<typeof LinearGradient>('linear-gradient', {
      render: (p) => p.children,
    }),
  };
});
jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
    Card: stubComponent<typeof Card>('card', { render: (p) => p.children }),
    GlassCard: stubComponent<typeof GlassCard>('glass-card', { render: (p) => p.children }),
    Button: stubComponent<typeof Button>('button', { text: (p) => p.title }),
  };
});

describe('DebateTypingIndicator', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(<DebateTypingIndicator aiName="Claude" />);
    expect(result).toBeTruthy();
  });
});
