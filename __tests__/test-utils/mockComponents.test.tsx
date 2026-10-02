import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { GradientButton as RealGradientButton } from '@/components/molecules/common/GradientButton';
import type { AddAIPill as RealAddAIPill } from '@/components/molecules/composer/AddAIPill';
import { GradientButton } from '@/components/molecules/common/GradientButton';
import { AddAIPill } from '@/components/molecules/composer/AddAIPill';
import { capturePropsOf, stubComponent } from '@test-utils/mockComponents';

// Exercises the documented factory pattern end to end: helper loaded with
// jest.requireActual, props typed from the real component via a type-only import.
jest.mock('@/components/molecules/common/GradientButton', () => {
  const { stubComponent: stub } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    GradientButton: stub<typeof RealGradientButton>('gradient-button', {
      onPress: (props) => (props.disabled ? undefined : props.onPress),
      text: (props) => props.title,
    }),
  };
});

const mockAddAIPill = capturePropsOf<typeof RealAddAIPill>();
jest.mock('@/components/molecules/composer/AddAIPill', () => ({
  get AddAIPill() {
    return mockAddAIPill.Stub;
  },
}));

describe('stubComponent', () => {
  it('renders a pressable stub with typed text and handler', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(<GradientButton title="Start" onPress={onPress} />);

    expect(getByText('Start')).toBeTruthy();
    fireEvent.press(getByTestId('gradient-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('derives the handler from props (disabled drops it)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<GradientButton title="Start" onPress={onPress} disabled />);

    fireEvent.press(getByTestId('gradient-button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders a View with the stub name as testID by default, plus extra content', () => {
    const Panel = stubComponent<(props: { label: string }) => null>('panel', {
      render: (props) => <Text>{`extra ${props.label}`}</Text>,
    });
    const { getByTestId, getByText } = render(<Panel label="x" />);

    expect(getByTestId('panel')).toBeTruthy();
    expect(getByText('extra x')).toBeTruthy();
    expect(Panel.displayName).toBe('Stub(panel)');
  });

  it('supports a props-derived testID', () => {
    const Row = stubComponent<(props: { id: string }) => null>('row', {
      testID: (props) => `row-${props.id}`,
    });
    const { getByTestId } = render(<Row id="7" />);
    expect(getByTestId('row-7')).toBeTruthy();
  });
});

describe('capturePropsOf', () => {
  beforeEach(() => mockAddAIPill.reset());

  it('records typed props and lets the test invoke callbacks', () => {
    const onPress = jest.fn();
    render(<AddAIPill onPress={onPress} label="Add" emphasized />);

    expect(mockAddAIPill.calls).toHaveLength(1);
    expect(mockAddAIPill.latest().label).toBe('Add');
    expect(mockAddAIPill.latest().emphasized).toBe(true);

    mockAddAIPill.latest().onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when the component never rendered', () => {
    expect(() => mockAddAIPill.latest()).toThrow('never rendered');
  });

  it('renders custom content when given a render function', () => {
    const capture = capturePropsOf<(props: { title: string }) => null>((props) => (
      <Text>{props.title}</Text>
    ));
    const { getByText } = render(<capture.Stub title="Shown" />);

    expect(getByText('Shown')).toBeTruthy();
    expect(capture.latest().title).toBe('Shown');
  });
});
