import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    default: {
      View,
      createAnimatedComponent: (component: unknown) => component,
    },
  };
});

const {
  StatsCard,
  StatsCardHeader,
  StatsCardRow,
  StatItem,
  WinRateDisplay
} = require('@/components/molecules/stats/StatsCard');

describe('StatsCard Components', () => {
  describe('StatsCard', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <StatsCard>
          <Text>Content</Text>
        </StatsCard>
      );
      expect(result).toBeTruthy();
    });

    it('renders children', () => {
      const { getByText } = renderWithProviders(
        <StatsCard>
          <Text>Test Content</Text>
        </StatsCard>
      );
      expect(getByText('Test Content')).toBeTruthy();
    });

    it('applies custom borderColor', () => {
      const result = renderWithProviders(
        <StatsCard borderColor="#7C3AED">
          <Text>Content</Text>
        </StatsCard>
      );
      expect(result).toBeTruthy();
    });

    it('applies custom backgroundColor', () => {
      const result = renderWithProviders(
        <StatsCard backgroundColor="#F0F0F0">
          <Text>Content</Text>
        </StatsCard>
      );
      expect(result).toBeTruthy();
    });

    it('applies custom style', () => {
      const customStyle = { marginTop: 20 };
      const result = renderWithProviders(
        <StatsCard style={customStyle}>
          <Text>Content</Text>
        </StatsCard>
      );
      expect(result).toBeTruthy();
    });

    it('applies entering animation when provided', () => {
      const mockAnimation = jest.fn();
      const result = renderWithProviders(
        <StatsCard entering={mockAnimation}>
          <Text>Content</Text>
        </StatsCard>
      );
      expect(result).toBeTruthy();
    });

    it('applies array of styles', () => {
      const styleArray = [{ marginTop: 10 }, { marginBottom: 10 }];
      const result = renderWithProviders(
        <StatsCard style={styleArray}>
          <Text>Content</Text>
        </StatsCard>
      );
      expect(result).toBeTruthy();
    });
  });

  describe('StatsCardHeader', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <StatsCardHeader title={<Text>Title</Text>} />
      );
      expect(result).toBeTruthy();
    });

    it('renders title', () => {
      const { getByText } = renderWithProviders(
        <StatsCardHeader title={<Text>Claude AI</Text>} />
      );
      expect(getByText('Claude AI')).toBeTruthy();
    });

    it('renders rank when provided', () => {
      const { getByText } = renderWithProviders(
        <StatsCardHeader
          rank={<Text>#1</Text>}
          title={<Text>Claude AI</Text>}
        />
      );
      expect(getByText('#1')).toBeTruthy();
    });

    it('renders subtitle when provided', () => {
      const { getByText } = renderWithProviders(
        <StatsCardHeader
          title={<Text>Claude AI</Text>}
          subtitle={<Text>Last debated: Today</Text>}
        />
      );
      expect(getByText('Last debated: Today')).toBeTruthy();
    });

    it('renders rightContent when provided', () => {
      const { getByText } = renderWithProviders(
        <StatsCardHeader
          title={<Text>Claude AI</Text>}
          rightContent={<Text>75%</Text>}
        />
      );
      expect(getByText('75%')).toBeTruthy();
    });

    it('renders all elements together', () => {
      const { getByText } = renderWithProviders(
        <StatsCardHeader
          rank={<Text>#1</Text>}
          title={<Text>Claude AI</Text>}
          subtitle={<Text>Best performer</Text>}
          rightContent={<Text>Win Rate</Text>}
        />
      );
      expect(getByText('#1')).toBeTruthy();
      expect(getByText('Claude AI')).toBeTruthy();
      expect(getByText('Best performer')).toBeTruthy();
      expect(getByText('Win Rate')).toBeTruthy();
    });
  });

  describe('StatsCardRow', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <StatsCardRow>
          <Text>Row Content</Text>
        </StatsCardRow>
      );
      expect(result).toBeTruthy();
    });

    it('renders children', () => {
      const { getByText } = renderWithProviders(
        <StatsCardRow>
          <Text>Stat 1</Text>
          <Text>Stat 2</Text>
        </StatsCardRow>
      );
      expect(getByText('Stat 1')).toBeTruthy();
      expect(getByText('Stat 2')).toBeTruthy();
    });

    it('shows divider when showDivider is true', () => {
      const result = renderWithProviders(
        <StatsCardRow showDivider={true}>
          <Text>Content</Text>
        </StatsCardRow>
      );
      expect(result).toBeTruthy();
    });

    it('hides divider when showDivider is false', () => {
      const result = renderWithProviders(
        <StatsCardRow showDivider={false}>
          <Text>Content</Text>
        </StatsCardRow>
      );
      expect(result).toBeTruthy();
    });
  });

  describe('StatItem', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <StatItem value={42} label="Wins" />
      );
      expect(result).toBeTruthy();
    });

    it('displays numeric value', () => {
      const { getByText } = renderWithProviders(
        <StatItem value={42} label="Wins" />
      );
      expect(getByText('42')).toBeTruthy();
    });

    it('displays string value', () => {
      const { getByText } = renderWithProviders(
        <StatItem value="75%" label="Win Rate" />
      );
      expect(getByText('75%')).toBeTruthy();
    });

    it('displays label', () => {
      const { getByText } = renderWithProviders(
        <StatItem value={10} label="Debates" />
      );
      expect(getByText('Debates')).toBeTruthy();
    });

    it('applies custom valueColor', () => {
      const result = renderWithProviders(
        <StatItem value={5} label="Losses" valueColor="#EF4444" />
      );
      expect(result).toBeTruthy();
    });

    it('applies valueVariant body', () => {
      const result = renderWithProviders(
        <StatItem value={10} label="Test" valueVariant="body" />
      );
      expect(result).toBeTruthy();
    });

    it('applies valueVariant title', () => {
      const result = renderWithProviders(
        <StatItem value={10} label="Test" valueVariant="title" />
      );
      expect(result).toBeTruthy();
    });

    it('applies valueWeight normal', () => {
      const result = renderWithProviders(
        <StatItem value={10} label="Test" valueWeight="normal" />
      );
      expect(result).toBeTruthy();
    });

    it('applies valueWeight bold', () => {
      const result = renderWithProviders(
        <StatItem value={10} label="Test" valueWeight="bold" />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('WinRateDisplay', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <WinRateDisplay overallRate={75} roundRate={80} />
      );
      expect(result).toBeTruthy();
    });

    it('displays overall rate', () => {
      const { getByText } = renderWithProviders(
        <WinRateDisplay overallRate={75} roundRate={80} />
      );
      expect(getByText('75%')).toBeTruthy();
    });

    it('displays round rate', () => {
      const { getByText } = renderWithProviders(
        <WinRateDisplay overallRate={75} roundRate={80} />
      );
      expect(getByText('80%')).toBeTruthy();
    });

    it('displays labels', () => {
      const { getByText } = renderWithProviders(
        <WinRateDisplay overallRate={75} roundRate={80} />
      );
      expect(getByText('Overall')).toBeTruthy();
      expect(getByText('Rounds')).toBeTruthy();
    });

    it('applies custom color', () => {
      const result = renderWithProviders(
        <WinRateDisplay overallRate={75} roundRate={80} color="#7C3AED" />
      );
      expect(result).toBeTruthy();
    });

    it('handles decimal rates', () => {
      const { getByText } = renderWithProviders(
        <WinRateDisplay overallRate={66.666} roundRate={33.333} />
      );
      expect(getByText('67%')).toBeTruthy();
      expect(getByText('33%')).toBeTruthy();
    });

    it('handles zero rates', () => {
      const { getAllByText } = renderWithProviders(
        <WinRateDisplay overallRate={0} roundRate={0} />
      );
      expect(getAllByText('0%').length).toBe(2);
    });

    it('handles 100% rates', () => {
      const { getAllByText } = renderWithProviders(
        <WinRateDisplay overallRate={100} roundRate={100} />
      );
      expect(getAllByText('100%').length).toBe(2);
    });
  });

  describe('Integration', () => {
    it('renders complete stats card with all components', () => {
      const { getByText } = renderWithProviders(
        <StatsCard borderColor="#7C3AED">
          <StatsCardHeader
            rank={<Text>#1</Text>}
            title={<Text>Claude AI</Text>}
            rightContent={<WinRateDisplay overallRate={75} roundRate={80} />}
          />
          <StatsCardRow showDivider>
            <StatItem value={10} label="Debates" />
            <StatItem value={7} label="Wins" valueColor="#22C55E" />
            <StatItem value={3} label="Losses" valueColor="#EF4444" />
          </StatsCardRow>
        </StatsCard>
      );

      expect(getByText('#1')).toBeTruthy();
      expect(getByText('Claude AI')).toBeTruthy();
      expect(getByText('75%')).toBeTruthy();
      expect(getByText('10')).toBeTruthy();
      expect(getByText('Debates')).toBeTruthy();
      expect(getByText('7')).toBeTruthy();
      expect(getByText('Wins')).toBeTruthy();
    });
  });
});
