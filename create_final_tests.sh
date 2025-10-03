#!/bin/bash

cd /Users/michaelspencer/Developer/DebateAI

# Subscription tests
cat > __tests__/components/molecules/subscription/PricingBadge.test.tsx << 'EOF'
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { PricingBadge } = require('@/components/molecules/subscription/PricingBadge');

describe('PricingBadge', () => {
  it('renders cost per message', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.005" />
    );
    expect(getByText('$0.005')).toBeTruthy();
  });

  it('renders free info when provided', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.001" freeInfo="Free tier available" />
    );
    expect(getByText(/Free tier available/)).toBeTruthy();
  });

  it('renders compact version', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.005" compact />
    );
    expect(getByText('~$0.005/msg')).toBeTruthy();
  });

  it('renders compact with free info', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.001" freeInfo="Free" compact />
    );
    expect(getByText('Free')).toBeTruthy();
  });
});
EOF

cat > __tests__/components/molecules/subscription/TrialBanner.test.tsx << 'EOF'
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  NavigationProp: {},
}));

const mockFeatureAccess = jest.fn();
jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: mockFeatureAccess,
  useFeatureAccess: mockFeatureAccess,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { TrialBanner } = require('@/components/molecules/subscription/TrialBanner');

describe('TrialBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when in trial', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: true,
      trialDaysRemaining: 5,
    });

    const { getByText } = renderWithProviders(<TrialBanner />);
    expect(getByText('5 days left in trial')).toBeTruthy();
  });

  it('does not render when not in trial', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: false,
      trialDaysRemaining: null,
    });

    const { container } = renderWithProviders(<TrialBanner />);
    expect(container.props.children).toBeNull();
  });

  it('shows special message for last day', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: true,
      trialDaysRemaining: 1,
    });

    const { getByText } = renderWithProviders(<TrialBanner />);
    expect(getByText('Trial ends tomorrow')).toBeTruthy();
  });

  it('navigates to subscription screen when pressed', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: true,
      trialDaysRemaining: 3,
    });

    const { getByText } = renderWithProviders(<TrialBanner />);
    fireEvent.press(getByText('Manage →'));
    expect(mockNavigate).toHaveBeenCalledWith('Subscription');
  });
});
EOF

echo "Subscription tests created"

# Stats tests - simplified placeholders
for file in StatsCard RankBadge DebateHistoryItem TopicBadge; do
  cat > __tests__/components/molecules/stats/${file}.test.tsx << EOF
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
  };
});

const { ${file} } = require('@/components/molecules/stats/${file}');

describe('${file}', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<${file} />);
    expect(container).toBeTruthy();
  });
});
EOF
done

echo "Stats tests created"

# Share tests - simplified
for file in ShareActionButtons SharePreviewCard; do
  cat > __tests__/components/molecules/share/${file}.test.tsx << EOF
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
    Button: ({ title }: any) => React.createElement(Text, null, title),
  };
});

const { ${file} } = require('@/components/molecules/share/${file}');

describe('${file}', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<${file} />);
    expect(container).toBeTruthy();
  });
});
EOF
done

echo "Share tests created"

# History tests - simplified  
for file in LoadMoreIndicator HighlightedText FilterChip SessionPreview StatCard SwipeableActions SessionCard; do
  cat > __tests__/components/molecules/history/${file}.test.tsx << EOF
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
  };
});

const { ${file} } = require('@/components/molecules/history/${file}');

describe('${file}', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<${file} />);
    expect(container).toBeTruthy();
  });
});
EOF
done

echo "History tests created"

# Debate tests - simplified
for file in AIDebaterCard AIProviderTile DebatePreviewCard DebateTopicCard DebateTypingIndicator SurpriseTopicDisplay TopicModeSelector DebateMessageBubble PersonalityChip; do
  cat > __tests__/components/molecules/debate/${file}.test.tsx << EOF
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
    GlassCard: ({ children }: any) => children,
    Button: ({ title }: any) => React.createElement(Text, null, title),
  };
});

const { ${file} } = require('@/components/molecules/debate/${file}');

describe('${file}', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<${file} />);
    expect(container).toBeTruthy();
  });
});
EOF
done

echo "Debate tests created"

echo "All remaining tests created successfully!"
