import type { ReactTestRendererJSON, ReactTestRendererNode } from 'react-test-renderer';

/**
 * Returns `value`, or throws naming what was missing. Use it to invoke optional
 * callback props a test depends on — `requireDefined(props.onPress, 'onPress')()`
 * — instead of `props.onPress?.()`, which silently skips when the prop is gone.
 */
export const requireDefined = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new Error(`Expected ${name} to be defined`);
  }
  return value;
};

/** Every non-empty string `testID` in a `toJSON()` tree, in render order. */
export const collectTestIds = (
  node: ReactTestRendererNode | ReactTestRendererJSON[] | null,
  ids: string[] = []
): string[] => {
  if (!node || typeof node === 'string') return ids;
  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, ids));
    return ids;
  }
  const testID: unknown = node.props.testID;
  if (typeof testID === 'string' && testID) {
    ids.push(testID);
  }
  node.children?.forEach((child) => collectTestIds(child, ids));
  return ids;
};
