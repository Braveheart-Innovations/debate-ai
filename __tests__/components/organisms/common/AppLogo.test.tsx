import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { AppLogo } from '@/components/organisms/common/AppLogo';
import { AI_PROVIDERS } from '@/config/aiProviders';
import type { LinearGradient } from 'expo-linear-gradient';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

const mockGradient = capturePropsOf<typeof LinearGradient>((props) => (
  <View {...props}>{props.children}</View>
));
const mockIcon = capturePropsOf<typeof MaterialCommunityIcons>();

jest.mock('expo-linear-gradient', () => ({
  __esModule: true,
  get LinearGradient() {
    return mockGradient.Stub;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  __esModule: true,
  get MaterialCommunityIcons() {
    return mockIcon.Stub;
  },
}));

jest.mock('@/components/molecules', () => ({}));

describe('AppLogo', () => {
  beforeEach(() => {
    mockGradient.reset();
    mockIcon.reset();
  });

  const extractStyle = (style: StyleProp<ViewStyle>): ViewStyle => StyleSheet.flatten(style) ?? {};

  it('renders orbit nodes for each provider color', () => {
    const { UNSAFE_queryAllByType } = renderWithProviders(<AppLogo size={120} />);

    const views = UNSAFE_queryAllByType(View);
    const orbitNodes = views.filter((node) => {
      const style = extractStyle(node.props.style);
      return (
        style.position === 'absolute' &&
        typeof style.backgroundColor === 'string' &&
        style.backgroundColor !== '#f8f9fa' &&
        style.borderRadius &&
        typeof style.left === 'number' &&
        typeof style.top === 'number'
      );
    });

    expect(orbitNodes).toHaveLength(AI_PROVIDERS.length);
  });

  it('passes gradient colors and icon sizing based on the provided size', () => {
    renderWithProviders(<AppLogo size={200} />);

    expect(mockGradient.calls.length).toBeGreaterThan(0);
    const gradientProps = mockGradient.calls[0];
    expect(Array.isArray(gradientProps.colors)).toBe(true);
    expect(gradientProps.colors.length).toBeGreaterThan(0);

    expect(mockIcon.calls.length).toBeGreaterThan(0);
    const iconProps = mockIcon.calls[0];
    expect(iconProps).toMatchObject({ name: 'brain', color: 'white', size: 200 * 0.16 });
  });
});
