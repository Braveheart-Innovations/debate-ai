import type { JSXElementConstructor, ReactNode } from 'react';
import { Text, TouchableOpacity, View, type TouchableOpacityProps } from 'react-native';

/**
 * Typed replacements for `(props: any) => …` component stubs in `jest.mock`
 * factories. Props come from the real component's type, so a stub that reads
 * a prop the component no longer has fails the test typecheck instead of
 * silently drifting.
 *
 * Inside a factory, load this module with `jest.requireActual` (factories may
 * not reference imports):
 *
 *   jest.mock('@/components/molecules', () => {
 *     const { stubComponent } = jest.requireActual<
 *       typeof import('@test-utils/mockComponents')
 *     >('@test-utils/mockComponents');
 *     return {
 *       GradientButton: stubComponent<typeof GradientButton>('gradient-button', {
 *         onPress: (p) => (p.disabled ? undefined : p.onPress),
 *         text: (p) => p.title,
 *       }),
 *     };
 *   });
 *
 * `typeof GradientButton` may come from a top-level `import type` — type
 * references are erased and allowed in factories.
 */

/** Bound that accepts every component (`never` props are assignable from any). */
export type AnyComponent = JSXElementConstructor<never>;

/** Props of a component type, e.g. `PropsOf<typeof Header>`. */
export type PropsOf<C extends AnyComponent> = C extends JSXElementConstructor<infer P> ? P : never;

export type StubComponent<P> = ((props: P) => ReactNode) & { displayName: string };

export interface StubOptions<P> {
  /** testID on the stub's root; defaults to the stub name. */
  testID?: string | ((props: P) => string | undefined);
  /** Text rendered inside the stub. */
  text?: (props: P) => ReactNode;
  /** When given, the root is pressable and calls the returned handler (pass the real one through). */
  onPress?: (props: P) => TouchableOpacityProps['onPress'];
  /** Extra content rendered after the text (e.g. `(p) => p.children`). */
  render?: (props: P) => ReactNode;
}

/**
 * A lightweight stand-in that renders a View (or a pressable when `onPress`
 * is given) with a testID, optional text, and optional extra content.
 */
export function stubComponent<C extends AnyComponent>(
  name: string,
  options: StubOptions<PropsOf<C>> = {}
): StubComponent<PropsOf<C>> {
  const { testID, text, onPress, render } = options;

  const Stub = (props: PropsOf<C>): ReactNode => {
    const resolvedTestID = typeof testID === 'function' ? testID(props) : (testID ?? name);
    const content = (
      <>
        {text ? <Text>{text(props)}</Text> : null}
        {render ? render(props) : null}
      </>
    );

    if (onPress) {
      return (
        <TouchableOpacity testID={resolvedTestID} onPress={onPress(props)}>
          {content}
        </TouchableOpacity>
      );
    }
    return <View testID={resolvedTestID}>{content}</View>;
  };

  Stub.displayName = `Stub(${name})`;
  return Stub;
}

export interface PropsCapture<C extends AnyComponent> {
  /** Use as the mocked component; records the props of every render. */
  Stub: StubComponent<PropsOf<C>>;
  /** Props of every render, oldest first. */
  readonly calls: PropsOf<C>[];
  /** Props of the most recent render; throws if the component never rendered. */
  latest(): PropsOf<C>;
  /** Forget recorded renders (call in `beforeEach`). */
  reset(): void;
}

/**
 * Records the props a component is rendered with so a test can assert on them
 * or invoke callbacks (`capture.latest().onSelect('x')`). Renders nothing
 * unless `render` is given.
 *
 * Create it at module scope with a `mock` prefix so the factory may reference
 * it, and read it lazily through a getter — the factory runs before the
 * module-scope const is initialized:
 *
 *   const mockTopicSelector = capturePropsOf<typeof DebateTopicSelector>();
 *   jest.mock('@/components/organisms/debate/DebateTopicSelector', () => ({
 *     get DebateTopicSelector() {
 *       return mockTopicSelector.Stub;
 *     },
 *   }));
 */
export function capturePropsOf<C extends AnyComponent>(
  render?: (props: PropsOf<C>) => ReactNode
): PropsCapture<C> {
  const calls: PropsOf<C>[] = [];

  const Stub = (props: PropsOf<C>): ReactNode => {
    calls.push(props);
    return render ? render(props) : null;
  };
  Stub.displayName = 'PropsCapture';

  return {
    Stub,
    calls,
    latest() {
      const props = calls[calls.length - 1];
      if (props === undefined) {
        throw new Error('capturePropsOf: the component was never rendered');
      }
      return props;
    },
    reset() {
      calls.length = 0;
    },
  };
}
