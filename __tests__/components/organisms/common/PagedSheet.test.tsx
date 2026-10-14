import React from 'react';
import { Keyboard, Modal, StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { requireDefined } from '@test-utils/queries';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PagedSheet, usePagedSheetNav } from '@/components/organisms/common/PagedSheet';

jest.mock('@/components/organisms/help/HelpModalHost', () => ({
  HelpModalHost: () => null,
}));

const PushButton: React.FC<{ to: string }> = ({ to }) => {
  const nav = usePagedSheetNav();
  return (
    <TouchableOpacity testID={`push-${to}`} onPress={() => nav.push(to)}>
      <Text>{`go to ${to}`}</Text>
    </TouchableOpacity>
  );
};

const renderSheet = (onClose = jest.fn()) => {
  const result = renderWithProviders(
    <PagedSheet visible onClose={onClose} testID="paged">
      <PagedSheet.Page id="root" title="Root Title">
        <Text>root body</Text>
        <PushButton to="second" />
      </PagedSheet.Page>
      <PagedSheet.Page id="second" title="Second Title">
        <Text>second body</Text>
      </PagedSheet.Page>
    </PagedSheet>
  );
  return { ...result, onClose };
};

describe('PagedSheet', () => {
  it('renders the root page with its title and no back button', () => {
    const { getByText, queryByTestId } = renderSheet();

    expect(getByText('Root Title')).toBeTruthy();
    expect(getByText('root body')).toBeTruthy();
    expect(queryByTestId('paged-back')).toBeNull();
  });

  it('pushes a page, updates the title, and pops via the back button', () => {
    const { getByText, getByTestId, queryByText, queryByTestId } = renderSheet();

    fireEvent.press(getByTestId('push-second'));
    expect(getByText('Second Title')).toBeTruthy();
    expect(getByText('second body')).toBeTruthy();

    fireEvent.press(getByTestId('paged-back'));
    expect(getByText('Root Title')).toBeTruthy();
    expect(queryByText('second body')).toBeNull();
    expect(queryByTestId('paged-back')).toBeNull();
  });

  it('pops a pushed page on request-close before closing the sheet', () => {
    const { getByTestId, getByText, onClose, UNSAFE_getByType } = renderSheet();

    fireEvent.press(getByTestId('push-second'));
    act(() => {
      UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(getByText('Root Title')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from any depth when the backdrop is pressed', () => {
    const { getByTestId, onClose } = renderSheet();

    fireEvent.press(getByTestId('push-second'));
    fireEvent.press(getByTestId('paged-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses the keyboard when the sheet opens', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    renderSheet();
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  // Walks up from a node to the nearest ancestor satisfying the predicate.
  const closest = (
    node: ReactTestInstance | null,
    predicate: (instance: ReactTestInstance) => boolean
  ): ReactTestInstance | null => {
    for (let current = node; current; current = current.parent) {
      if (predicate(current)) return current;
    }
    return null;
  };

  it('keeps pages under the top one from taking taps', () => {
    const { getByTestId, getByText } = renderSheet();

    fireEvent.press(getByTestId('push-second'));

    const hasPointerEvents = (instance: ReactTestInstance) => instance.props.pointerEvents !== undefined;
    const rootPage = closest(getByText('root body', { includeHiddenElements: true }), hasPointerEvents);
    const topPage = closest(getByText('second body'), hasPointerEvents);
    expect(rootPage?.props.pointerEvents).toBe('none');
    expect(topPage?.props.pointerEvents).toBe('auto');
  });

  it('pins a pushed page to the sheet height below the measured header', () => {
    const { getByTestId, getByText } = renderSheet();
    const header = closest(getByTestId('paged'), (instance) => typeof instance.props.onLayout === 'function');

    act(() => {
      requireDefined(header?.props.onLayout, 'header onLayout')({ nativeEvent: { layout: { height: 80 } } });
    });
    fireEvent.press(getByTestId('push-second'));

    const pinned = closest(getByText('second body'), (instance) => {
      const style = StyleSheet.flatten<ViewStyle>(instance.props.style);
      return typeof style?.height === 'number';
    });
    const pageHeight = StyleSheet.flatten<ViewStyle>(pinned?.props.style).height;
    const sheet = closest(header, (instance) => {
      const style = StyleSheet.flatten<ViewStyle>(instance.props.style);
      return typeof style?.maxHeight === 'number';
    });
    const sheetMaxHeight = StyleSheet.flatten<ViewStyle>(sheet?.props.style).maxHeight;
    // The page gets exactly what the header leaves of the sheet's max height.
    expect(pageHeight).toBe(Number(sheetMaxHeight) - 80);
  });
});
