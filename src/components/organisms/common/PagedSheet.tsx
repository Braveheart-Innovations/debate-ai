/**
 * PagedSheet
 *
 * Bottom-sheet Modal with an internal page stack: sub-pickers slide in as
 * pages inside the one native Modal instead of stacking further Modals.
 * The first Page child is the root; it sizes the sheet to its content.
 * Pushed pages fill the sheet to its max height (the sheet animates between
 * the two). Page content navigates with usePagedSheetNav().
 *
 * Android back (onRequestClose) pops a page before closing the sheet, and
 * HelpModalHost is mounted inside so InfoButtons on any page present help
 * above this Modal (see modal-stacking notes in HelpModalHost).
 *
 *   <PagedSheet visible={visible} onClose={close}>
 *     <PagedSheet.Page id="root" title="Claude">...</PagedSheet.Page>
 *     <PagedSheet.Page id="model" title="Select Model">...</PagedSheet.Page>
 *   </PagedSheet>
 */

import React, {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  SlideInRight,
  SlideOutRight,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { SheetHeader } from '@/components/molecules';
import { HelpModalHost } from '../help/HelpModalHost';

const MAX_HEIGHT_FRACTION = 0.85;
const HEIGHT_ANIMATION_MS = 250;
const PAGE_ANIMATION_MS = 250;

export interface PagedSheetPageProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

// Marker component: PagedSheet reads its props and renders the children itself.
const PagedSheetPage: React.FC<PagedSheetPageProps> = () => null;

interface PagedSheetNav {
  push: (pageId: string) => void;
  pop: () => void;
  popToRoot: () => void;
  depth: number;
}

const PagedSheetNavContext = createContext<PagedSheetNav | null>(null);

export const usePagedSheetNav = (): PagedSheetNav => {
  const nav = useContext(PagedSheetNavContext);
  if (!nav) {
    throw new Error('usePagedSheetNav must be used inside a PagedSheet page');
  }
  return nav;
};

interface PagedSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
}

const PagedSheetComponent: React.FC<PagedSheetProps> = ({
  visible,
  onClose,
  children,
  testID,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const maxHeightPx = windowHeight * MAX_HEIGHT_FRACTION;

  const pages = useMemo(() => {
    const found: PagedSheetPageProps[] = [];
    Children.forEach(children, (child) => {
      if (isValidElement<PagedSheetPageProps>(child) && child.type === PagedSheetPage) {
        found.push(child.props);
      }
    });
    return found;
  }, [children]);

  const rootId = pages[0]?.id;
  const [stack, setStack] = useState<string[]>(rootId ? [rootId] : []);

  // Pushed pages get an explicit height (the sheet's max height below the
  // header) rather than filling the page stack. A page that filled it was
  // laid out at the root's height when it mounted; its slide-in animation
  // dropped the resize when the sheet then grew, so rows drawn below the
  // old bottom edge ignored taps, which fell through to the root page.
  const [headerHeight, setHeaderHeight] = useState(0);
  const pushedPageHeight = headerHeight > 0 ? maxHeightPx - headerHeight : null;

  // The sheet's measured content height while at root (auto-sized); the
  // start/end point for the grow/shrink animation around pushed pages.
  const rootSheetHeightRef = useRef(0);
  // 0 = auto (size to root content); > 0 = fixed animated height.
  const sheetHeight = useSharedValue(0);

  const prevDepthRef = useRef(0);

  useEffect(() => {
    if (visible && rootId) {
      setStack([rootId]);
      prevDepthRef.current = 0;
      sheetHeight.value = 0;
    }
  }, [visible, rootId, sheetHeight]);

  // A composer input left focused keeps the keyboard up behind the sheet,
  // and a page list's first tap would only dismiss it.
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  const releaseToAutoHeight = useCallback(() => {
    sheetHeight.value = 0;
  }, [sheetHeight]);

  const push = useCallback(
    (pageId: string) => {
      if (!pages.some((page) => page.id === pageId)) {
        if (__DEV__) {
          throw new Error(`PagedSheet: no page with id "${pageId}"`);
        }
        return;
      }
      setStack((prev) => (prev[prev.length - 1] === pageId ? prev : [...prev, pageId]));
    },
    [pages]
  );

  const pop = useCallback(() => {
    setStack((prev) => (prev.length <= 1 ? prev : prev.slice(0, -1)));
  }, []);

  const popToRoot = useCallback(() => {
    setStack((prev) => (prev.length <= 1 ? prev : prev.slice(0, 1)));
  }, []);

  const depth = stack.length - 1;

  // Keep a pushed page's fixed height in sync when the window resizes
  // (rotation, split view) - the depth effect below only fires on push/pop.
  useEffect(() => {
    if (depth > 0 && sheetHeight.value > 0) {
      sheetHeight.value = withTiming(maxHeightPx, { duration: HEIGHT_ANIMATION_MS });
    }
  }, [depth, maxHeightPx, sheetHeight]);

  // Grow the sheet to max height while any page is pushed; shrink back to the
  // root's measured content height (then release to auto) when returning.
  useEffect(() => {
    const prevDepth = prevDepthRef.current;
    prevDepthRef.current = depth;
    if (prevDepth === 0 && depth > 0) {
      sheetHeight.value = rootSheetHeightRef.current || maxHeightPx;
      sheetHeight.value = withTiming(maxHeightPx, { duration: HEIGHT_ANIMATION_MS });
    } else if (prevDepth > 0 && depth === 0) {
      if (rootSheetHeightRef.current > 0) {
        sheetHeight.value = withTiming(
          rootSheetHeightRef.current,
          { duration: HEIGHT_ANIMATION_MS },
          (finished) => {
            if (finished) runOnJS(releaseToAutoHeight)();
          }
        );
      } else {
        sheetHeight.value = 0;
      }
    }
  }, [depth, maxHeightPx, sheetHeight, releaseToAutoHeight]);
  const nav = useMemo(
    () => ({ push, pop, popToRoot, depth }),
    [push, pop, popToRoot, depth]
  );

  const handleRequestClose = () => {
    if (depth > 0) {
      pop();
    } else {
      onClose();
    }
  };

  const animatedSheetStyle = useAnimatedStyle(() => {
    return sheetHeight.value > 0 ? { height: sheetHeight.value } : {};
  });

  const activePage = pages.find((page) => page.id === stack[stack.length - 1]);
  if (!activePage) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      // Draw behind the Android system bars: a Modal is its own Dialog
      // window, and on Android 15 edge-to-edge its nav bar otherwise renders
      // a system scrim that ignores the in-app theme.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleRequestClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close sheet"
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.background, maxHeight: maxHeightPx },
            animatedSheetStyle,
          ]}
          onLayout={(event) => {
            if (sheetHeight.value === 0) {
              rootSheetHeightRef.current = event.nativeEvent.layout.height;
            }
          }}
        >
          <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <SheetHeader
              title={activePage.title}
              onBack={depth > 0 ? pop : undefined}
              onClose={onClose}
              showHandle
              testID={testID}
            />
          </View>
          <PagedSheetNavContext.Provider value={nav}>
            <View style={[styles.pageStack, { paddingBottom: insets.bottom + 16 }]}>
              {stack.map((pageId, index) => {
                const page = pages.find((p) => p.id === pageId);
                if (!page) return null;
                const isRoot = index === 0;
                const isTop = index === stack.length - 1;
                return (
                  <Animated.View
                    key={pageId}
                    entering={isRoot ? undefined : SlideInRight.duration(PAGE_ANIMATION_MS)}
                    exiting={isRoot ? undefined : SlideOutRight.duration(PAGE_ANIMATION_MS)}
                    accessibilityElementsHidden={!isTop}
                    importantForAccessibility={isTop ? 'auto' : 'no-hide-descendants'}
                    // Pages under the top one stay mounted (and keep their
                    // state) but must never take a tap meant for the top page.
                    pointerEvents={isTop ? 'auto' : 'none'}
                    style={
                      isRoot
                        ? styles.rootPage
                        : [
                            pushedPageHeight !== null
                              ? [styles.pushedPagePinned, { height: pushedPageHeight }]
                              : styles.pushedPage,
                            {
                              backgroundColor: theme.colors.background,
                              paddingBottom: insets.bottom + 16,
                            },
                          ]
                    }
                    testID={testID ? `${testID}-page-${pageId}` : undefined}
                  >
                    {page.children}
                  </Animated.View>
                );
              })}
            </View>
          </PagedSheetNavContext.Provider>
        </Animated.View>
      </View>
      {/* Lets the InfoButtons' help sheet present above this Modal */}
      <HelpModalHost />
    </Modal>
  );
};

export const PagedSheet = Object.assign(PagedSheetComponent, { Page: PagedSheetPage });

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  pageStack: {
    flexGrow: 1,
    flexShrink: 1,
  },
  rootPage: {
    flexGrow: 1,
    flexShrink: 1,
  },
  pushedPage: {
    ...StyleSheet.absoluteFill,
  },
  pushedPagePinned: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});

export default PagedSheet;
