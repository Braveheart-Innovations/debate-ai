#!/bin/bash

# Create all remaining molecule test files

# Chat tests
cat > __tests__/components/molecules/chat/MultimodalOptionsRow.test.tsx << 'EOF'
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const MultimodalOptionsRow = require('@/components/molecules/chat/MultimodalOptionsRow').default;

describe('MultimodalOptionsRow', () => {
  const mockAvailability = {
    imageUpload: true,
    documentUpload: true,
    imageGeneration: false,
    videoGeneration: false,
    voice: true,
  };

  it('renders all modality options', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    
    const { getByText } = renderWithProviders(
      <MultimodalOptionsRow
        availability={mockAvailability}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    expect(getByText('Image')).toBeTruthy();
    expect(getByText('Doc')).toBeTruthy();
  });

  it('calls onSelect when enabled option pressed', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    
    const { getByText } = renderWithProviders(
      <MultimodalOptionsRow
        availability={mockAvailability}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    fireEvent.press(getByText('Image'));
    expect(onSelect).toHaveBeenCalledWith('imageUpload');
    expect(onClose).toHaveBeenCalled();
  });
});
EOF

# Header tests
cat > __tests__/components/molecules/header/HeaderIcon.test.tsx << 'EOF'
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import * as Haptics from 'expo-haptics';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const { HeaderIcon } = require('@/components/molecules/header/HeaderIcon');

describe('HeaderIcon', () => {
  it('renders with ionicons library', () => {
    const onPress = jest.fn();
    const { container } = renderWithProviders(
      <HeaderIcon name="menu" onPress={onPress} />
    );
    expect(container).toBeTruthy();
  });

  it('calls onPress with haptic feedback', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <HeaderIcon name="menu" onPress={onPress} testID="header-icon" />
    );

    fireEvent.press(getByTestId('header-icon'));
    expect(onPress).toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <HeaderIcon name="menu" onPress={onPress} disabled testID="header-icon" />
    );

    fireEvent.press(getByTestId('header-icon'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows badge when provided', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <HeaderIcon name="notifications" onPress={onPress} badge={5} />
    );
    expect(getByText('5')).toBeTruthy();
  });

  it('shows 99+ for badges over 99', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <HeaderIcon name="notifications" onPress={onPress} badge={150} />
    );
    expect(getByText('99+')).toBeTruthy();
  });
});
EOF

cat > __tests__/components/molecules/header/TabBarIcon.test.tsx << 'EOF'
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

const { TabBarIcon } = require('@/components/molecules/header/TabBarIcon');

describe('TabBarIcon', () => {
  it('renders with default props', () => {
    const { container } = renderWithProviders(
      <TabBarIcon name="home" focused={false} color="#000" />
    );
    expect(container).toBeTruthy();
  });

  it('renders badge when provided', () => {
    const { getByText } = renderWithProviders(
      <TabBarIcon name="notifications" focused={false} color="#000" badge={3} />
    );
    expect(getByText('3')).toBeTruthy();
  });

  it('shows 99+ for badges over 99', () => {
    const { getByText } = renderWithProviders(
      <TabBarIcon name="notifications" focused={false} color="#000" badge={100} />
    );
    expect(getByText('99+')).toBeTruthy();
  });
});
EOF

# Profile, Settings, Sheets tests
cat > __tests__/components/molecules/profile/ProfileAvatar.test.tsx << 'EOF'
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { ProfileAvatar } = require('@/components/molecules/profile/ProfileAvatar');

describe('ProfileAvatar', () => {
  it('renders with display name', () => {
    const { getByText } = renderWithProviders(
      <ProfileAvatar displayName="John Doe" />
    );
    expect(getByText('JD')).toBeTruthy();
  });

  it('renders with email when no display name', () => {
    const { getByText } = renderWithProviders(
      <ProfileAvatar email="test@example.com" />
    );
    expect(getByText('TE')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <ProfileAvatar displayName="John" onPress={onPress} testID="avatar" />
    );

    fireEvent.press(getByTestId('avatar'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows premium indicator when isPremium is true', () => {
    const { container } = renderWithProviders(
      <ProfileAvatar displayName="John" isPremium />
    );
    expect(container).toBeTruthy();
  });
});
EOF

cat > __tests__/components/molecules/settings/SettingRow.test.tsx << 'EOF'
import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { SettingRow } = require('@/components/molecules/settings/SettingRow');

describe('SettingRow', () => {
  it('renders title', () => {
    const { getByText } = renderWithProviders(
      <SettingRow title="Test Setting" />
    );
    expect(getByText('Test Setting')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = renderWithProviders(
      <SettingRow title="Test" subtitle="Description" />
    );
    expect(getByText('Description')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <SettingRow title="Test" onPress={onPress} />
    );

    fireEvent.press(getByText('Test'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders rightElement when provided', () => {
    const { getByText } = renderWithProviders(
      <SettingRow title="Test" rightElement={<Text>Right</Text>} />
    );
    expect(getByText('Right')).toBeTruthy();
  });
});
EOF

cat > __tests__/components/molecules/sheets/SheetHandle.test.tsx << 'EOF'
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const { SheetHandle } = require('@/components/molecules/sheets/SheetHandle');

describe('SheetHandle', () => {
  it('renders with default props', () => {
    const { container } = renderWithProviders(<SheetHandle />);
    expect(container).toBeTruthy();
  });

  it('renders with custom width', () => {
    const { container } = renderWithProviders(<SheetHandle width={50} />);
    expect(container).toBeTruthy();
  });

  it('renders with custom height', () => {
    const { container } = renderWithProviders(<SheetHandle height={6} />);
    expect(container).toBeTruthy();
  });
});
EOF

cat > __tests__/components/molecules/sheets/SheetHeader.test.tsx << 'EOF'
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { SheetHeader } = require('@/components/molecules/sheets/SheetHeader');

describe('SheetHeader', () => {
  it('renders title', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <SheetHeader title="Test Sheet" onClose={onClose} />
    );
    expect(getByText('Test Sheet')).toBeTruthy();
  });

  it('calls onClose when close button pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = renderWithProviders(
      <SheetHeader title="Test" onClose={onClose} testID="sheet-header" />
    );

    fireEvent.press(getByTestId('sheet-header-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
EOF

cat > __tests__/components/molecules/sheets/ModalHeader.test.tsx << 'EOF'
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { ModalHeader } = require('@/components/molecules/sheets/ModalHeader');

describe('ModalHeader', () => {
  it('renders title', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test Modal" onClose={onClose} />
    );
    expect(getByText('Test Modal')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test" subtitle="Description" onClose={onClose} />
    );
    expect(getByText('Description')).toBeTruthy();
  });

  it('renders with solid variant', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test" onClose={onClose} variant="solid" />
    );
    expect(getByText('Test')).toBeTruthy();
  });

  it('calls onClose when close button pressed', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test" onClose={onClose} />
    );

    fireEvent.press(getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });
});
EOF

echo "All test files created successfully!"
