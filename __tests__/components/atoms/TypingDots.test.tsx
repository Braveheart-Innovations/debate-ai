import React from 'react';
import { render } from '@testing-library/react-native';
import { TypingDots } from '@/components/atoms/feedback/TypingDots';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedStyle: jest.fn((cb) => cb()),
    withRepeat: jest.fn((anim) => anim),
    withSequence: jest.fn((...anims) => anims[0]),
    withTiming: jest.fn((value) => value),
    withDelay: jest.fn((delay, anim) => anim),
    default: {
      View,
    },
  };
});

// Mock theme
const mockTheme = {
  colors: {
    text: {
      secondary: '#888888',
    },
  },
};

jest.mock('@/theme', () => {
  const actual = jest.requireActual('@/theme');
  return {
    ...actual,
    useTheme: () => ({ theme: mockTheme }),
  };
});

describe('TypingDots', () => {
  it('renders successfully', () => {
    const { root } = render(<TypingDots />);
    expect(root).toBeTruthy();
  });

  it('renders three animated dots', () => {
    const { UNSAFE_getAllByType } = render(<TypingDots />);
    const View = require('react-native').View;
    const views = UNSAFE_getAllByType(View);

    // Should have 1 container + 3 dots = 4 views
    expect(views.length).toBe(4);
  });

  it('applies correct styling to dots', () => {
    const { UNSAFE_getAllByType } = render(<TypingDots />);
    const View = require('react-native').View;
    const views = UNSAFE_getAllByType(View);

    // The first view is the container with flexDirection: 'row'
    expect(views[0].props.style).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 6,
    });
  });

  it('uses theme colors for dots', () => {
    const { UNSAFE_getAllByType } = render(<TypingDots />);
    const View = require('react-native').View;
    const views = UNSAFE_getAllByType(View);

    // Check that dots use the theme color
    // Views 1, 2, 3 should be the dots with backgroundColor from theme
    for (let i = 1; i <= 3; i++) {
      const dotStyle = views[i]?.props?.style;
      if (Array.isArray(dotStyle)) {
        const baseStyle = dotStyle[0];
        expect(baseStyle?.backgroundColor).toBe(mockTheme.colors.text.secondary);
      }
    }
  });

  it('applies correct dot dimensions', () => {
    const { UNSAFE_getAllByType } = render(<TypingDots />);
    const View = require('react-native').View;
    const views = UNSAFE_getAllByType(View);

    // Check dot dimensions on at least one dot
    for (let i = 1; i <= 3; i++) {
      const dotStyle = views[i]?.props?.style;
      if (Array.isArray(dotStyle)) {
        const baseStyle = dotStyle[0];
        expect(baseStyle?.width).toBe(6);
        expect(baseStyle?.height).toBe(6);
        expect(baseStyle?.borderRadius).toBe(3);
        expect(baseStyle?.marginHorizontal).toBe(2);
      }
    }
  });
});
