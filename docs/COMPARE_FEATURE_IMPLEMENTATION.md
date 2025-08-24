# Compare Feature Implementation Guide for Symposium AI

## Executive Summary
This guide outlines the implementation of the Compare feature that enables users to send the same prompt to exactly two AI providers simultaneously and view their responses side-by-side. The feature is fully integrated with the existing app architecture, leveraging the gradient header design pattern, existing streaming infrastructure, and atomic design principles already established in the codebase.

## Table of Contents
1. [Feature Overview](#feature-overview)
2. [Architecture Design](#architecture-design)
3. [Component Hierarchy](#component-hierarchy)
4. [State Management](#state-management)
5. [Navigation Integration](#navigation-integration)
6. [Screen Layout](#screen-layout)
7. [Header Integration](#header-integration)
8. [Streaming Architecture](#streaming-architecture)
9. [Platform Considerations](#platform-considerations)
10. [Performance Optimization](#performance-optimization)
11. [Accessibility](#accessibility)
12. [Testing Strategy](#testing-strategy)
13. [Implementation Roadmap](#implementation-roadmap)

## Feature Overview

### Core Requirements
- **Two AI Comparison Only**: Exactly 2 AIs due to mobile screen constraints
- **Shared Input**: Single input bar sends to both AIs simultaneously
- **Real-time Streaming**: Concurrent streaming with visual delineation
- **Provider Flexibility**: Compare different providers OR models within same provider
- **Mobile-First Design**: Optimized for portrait and landscape orientations

### User Journey
1. User taps "Compare" tab in bottom navigation
2. Selects exactly 2 AIs (providers or models)
3. Types prompt in shared input bar
4. Views side-by-side streaming responses
5. Can scroll independently through each response
6. Option to save comparison or start new one

## Architecture Design

### Atomic Design Structure
Following the existing atomic architecture pattern and component organization:

```
src/
├── components/
│   ├── atoms/           # No new atoms needed (Box only)
│   ├── molecules/       # 5 new simple components
│   │   ├── CompareAICard.tsx
│   │   ├── CompareResponseBubble.tsx
│   │   ├── CompareDivider.tsx
│   │   ├── CompareModelBadge.tsx
│   │   └── CompareStreamIndicator.tsx
│   └── organisms/       
│       ├── navigation/  # Navigation-related organisms
│       │   └── CompareScreen.tsx  # Main Compare organism (already exists as placeholder)
│       └── compare/     # Compare-specific organisms
│           ├── CompareAISelector.tsx
│           ├── CompareInputBar.tsx
│           ├── CompareResponsePanel.tsx
│           ├── CompareResponseContainer.tsx
│           ├── CompareSyncScrollControl.tsx
│           └── CompareEmptyState.tsx
├── hooks/
│   └── compare/
│       ├── useCompareSession.ts
│       ├── useCompareStreaming.ts  # Extends existing useAIResponsesWithStreaming
│       ├── useCompareAISelection.ts
│       ├── useCompareSyncScroll.ts
│       └── useCompareOrientation.ts
├── store/
│   └── compareSlice.ts  # New slice for compare state
└── services/
    └── compare/
        ├── CompareService.ts
        ├── CompareStreamManager.ts  # Extends existing StreamingService
        └── ComparePromptBuilder.ts  # Extends existing PromptBuilder
```

### Integration with Existing Infrastructure
The Compare feature leverages:
- **Header Component**: Uses `variant="gradient"` with animated entrance
- **HeaderActions**: Integrated for settings access
- **Streaming Infrastructure**: Extends `useAIResponsesWithStreaming` and `StreamingService`
- **AI Adapters**: Uses existing `getCapabilities()` and adapter factory
- **Redux Patterns**: Follows existing sheet/modal management patterns
- **Theme System**: Consistent with `theme.colors`, `theme.spacing`, and light/dark mode

## Component Hierarchy

### Main Organism Component (CompareScreen)
```typescript
// src/components/organisms/navigation/CompareScreen.tsx
import { Header, HeaderActions } from '../';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CompareScreenProps {
  navigation?: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack?: () => void;
  };
}

export const CompareScreen: React.FC<CompareScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  
  // Main organism that integrates with existing patterns:
  // - Uses gradient Header with animated entrance
  // - Integrates HeaderActions for settings
  // - Manages SafeAreaView with proper edges
  // - Coordinates sub-organisms for compare functionality
  
  return (
    <SafeAreaView 
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['top', 'left', 'right']}>
      <Header
        variant="gradient"
        title="Compare AIs"
        subtitle="See how different AIs respond"
        showTime={true}
        showDate={true}
        animated={true}
        showProfileIcon={true}
        rightElement={<HeaderActions variant="gradient" />}
      />
      {/* Compare content */}
    </SafeAreaView>
  );
};
```

### Organism Components

#### 1. Gradient Header Integration
The Compare feature uses the existing `Header` component with gradient variant:
```typescript
<Header
  variant="gradient"
  title="Compare AIs"
  subtitle={getCompareSubtitle()} // Dynamic based on selection state
  showTime={true}
  showDate={true}
  animated={true}
  showProfileIcon={true}
  rightElement={<HeaderActions variant="gradient" />}
  onBack={navigation?.goBack} // Optional back navigation
  showBackButton={hasActiveComparison} // Show when comparing
/>
```

The header dynamically updates:
- **No AIs selected**: "Select two AIs to compare"
- **One AI selected**: "Select one more AI"
- **Both selected**: Shows AI names
- **During comparison**: Shows "Comparing..." with animated indicator

#### 2. CompareAISelector (Extends DynamicAISelector pattern)
```typescript
interface CompareAISelectorProps {
  selectedAIs: [AIConfig | null, AIConfig | null];
  onSelectionChange: (index: 0 | 1, ai: AIConfig) => void;
  availableAIs: AIConfig[];
}
```
- Modal or inline selector for choosing AIs
- Enforces exactly 2 selections
- Shows provider logos and model names
- Validates API key availability

#### 3. CompareResponsePanel (Uses existing MessageBubble patterns)
```typescript
interface CompareResponsePanelProps {
  ai: AIConfig;
  response: string;
  isStreaming: boolean;
  position: 'left' | 'right';
  scrollRef?: React.RefObject<ScrollView>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}
```
- Individual response container
- Handles streaming display
- Independent scrolling
- Visual indication of which AI

#### 4. CompareInputBar (Extends ChatInputBar patterns)
```typescript
interface CompareInputBarProps {
  onSend: (prompt: string) => void;
  disabled: boolean;
  isStreaming: boolean;
}
```
- Shared input field
- Send button
- Attachment support (if needed)
- Loading state during streaming

### Molecule Components

#### 1. CompareAICard
- Compact AI representation
- Provider logo + model name
- Selection state indicator
- Connection status badge

#### 2. CompareResponseBubble
- Styled message bubble
- Streaming cursor animation
- Error state display
- Timestamp and metadata

#### 3. CompareDivider
- Visual separator between panels
- Responsive to orientation
- Optional drag handle for resizing (tablet only)

## State Management

### Redux Slice Structure
```typescript
// compareSlice.ts
interface CompareSession {
  id: string;
  leftAI: AIConfig | null;
  rightAI: AIConfig | null;
  prompts: ComparePrompt[];
  createdAt: number;
  lastActivity: number;
}

interface ComparePrompt {
  id: string;
  text: string;
  timestamp: number;
  responses: {
    left: CompareResponse | null;
    right: CompareResponse | null;
  };
}

interface CompareResponse {
  content: string;
  isStreaming: boolean;
  startTime: number;
  endTime?: number;
  error?: string;
  metadata: {
    model: string;
    tokensUsed?: number;
    responseTime?: number;
  };
}

interface CompareState {
  currentSession: CompareSession | null;
  sessions: CompareSession[];
  isComparing: boolean;
  syncScroll: boolean;
  orientation: 'portrait' | 'landscape';
}
```

### Redux Actions
```typescript
const compareSlice = createSlice({
  name: 'compare',
  initialState,
  reducers: {
    // Session management
    startCompareSession: (state, action) => {},
    endCompareSession: (state) => {},
    clearCompareSession: (state) => {},
    
    // AI selection
    selectLeftAI: (state, action) => {},
    selectRightAI: (state, action) => {},
    swapAIs: (state) => {},
    
    // Prompting
    sendPrompt: (state, action) => {},
    
    // Streaming
    startStreaming: (state, action) => {},
    updateStreamingContent: (state, action) => {},
    endStreaming: (state, action) => {},
    streamingError: (state, action) => {},
    
    // Settings
    toggleSyncScroll: (state) => {},
    setOrientation: (state, action) => {},
  },
});
```

## Navigation Integration

### Tab Navigator (Already Implemented)
The Compare tab is already integrated in `AppNavigator.tsx`:
```typescript
// AppNavigator.tsx - Compare tab already exists
<Tab.Screen
  name="Compare"
  component={CompareScreen}  // Imported from '../components/organisms'
  options={{
    tabBarLabel: 'Compare',
    tabBarIcon: ({ color, focused }) => (
      <Ionicons 
        name={focused ? 'git-compare' : 'git-compare-outline'} 
        size={24} 
        color={color} 
      />
    ),
    // Badge shows when less than 2 AIs configured
    tabBarBadge: configuredCount < 2 ? '!' : undefined,
    tabBarBadgeStyle: {
      backgroundColor: theme.colors.error[500],
      fontSize: 10,
    },
  }}
/>
```

### Navigation Types Update
```typescript
// types/index.ts
export type RootStackParamList = {
  // ... existing types
  Compare: { 
    preselectedAIs?: [AIConfig, AIConfig];
    initialPrompt?: string;
  };
};
```

## Screen Layout

### Design Language Consistency
The Compare screen maintains consistency with the existing app design:
- **Gradient Header**: Uses the same animated gradient pattern as HomeScreen
- **Profile Icon**: Positioned in top-right like other screens
- **Safe Area**: Proper edge handling with `edges={['top', 'left', 'right']}`
- **Spacing**: All layouts use `theme.spacing` values
- **Colors**: Consistent use of `theme.colors` throughout

### Portrait Mode Layout
```
┌─────────────────────────────┐
│    Gradient Header Area      │
│  Compare AIs                 │
│  [subtitle based on state]   │ 
│                     [Profile]│
├─────────────────────────────┤
│                             │
│  ┌───────┬───────┐          │
│  │       │       │          │
│  │  AI 1 │  AI 2 │          │
│  │       │       │          │
│  │ Resp. │ Resp. │          │
│  │       │       │          │
│  │   ↕   │   ↕   │          │
│  │       │       │          │
│  └───────┴───────┘          │
│                             │
├─────────────────────────────┤
│     [Input Bar]    [Send]   │
└─────────────────────────────┘
```

### Landscape Mode Layout
```
┌──────────────────────────────────────────┐
│         Gradient Header Area              │
│  Compare AIs              [Profile][Settings]│
├──────────────────────────────────────────┤
│                                          │
│  ┌──────────────┬──────────────┐        │
│  │    AI 1      │     AI 2      │        │
│  │   Response   │   Response    │        │
│  │      ↕       │       ↕       │        │
│  └──────────────┴──────────────┘        │
│                                          │
├──────────────────────────────────────────┤
│        [Input Bar]           [Send]      │
└──────────────────────────────────────────┘
```

### Responsive Considerations
```typescript
// useCompareOrientation.ts
const useCompareOrientation = () => {
  const [orientation, setOrientation] = useState(getOrientation());
  const { width, height } = useWindowDimensions();
  
  useEffect(() => {
    const newOrientation = width > height ? 'landscape' : 'portrait';
    setOrientation(newOrientation);
  }, [width, height]);
  
  const panelWidth = orientation === 'portrait' 
    ? (width - 32) / 2  // Account for padding
    : (width - 48) / 2; // More padding in landscape
    
  return { orientation, panelWidth };
};
```

## Header Integration

### Dynamic Header States
The Compare screen header adapts based on the current state:

```typescript
// useCompareHeader.ts
const useCompareHeader = () => {
  const { leftAI, rightAI, isComparing } = useSelector(selectCompareState);
  
  const getHeaderConfig = () => {
    if (isComparing) {
      return {
        title: 'Comparing...',
        subtitle: `${leftAI.name} vs ${rightAI.name}`,
        showBackButton: true,
      };
    }
    
    if (!leftAI && !rightAI) {
      return {
        title: 'Compare AIs',
        subtitle: 'Select two AIs to compare',
        showBackButton: false,
      };
    }
    
    if (leftAI && !rightAI) {
      return {
        title: 'Compare AIs',
        subtitle: `${leftAI.name} selected - choose another`,
        showBackButton: false,
      };
    }
    
    return {
      title: 'Ready to Compare',
      subtitle: `${leftAI.name} vs ${rightAI.name}`,
      showBackButton: false,
    };
  };
  
  return getHeaderConfig();
};
```

### Integration with HeaderActions
The Compare screen uses the existing `HeaderActions` component for settings access:
- Settings sheet opens using existing Redux patterns
- Profile sheet integration maintained
- Consistent with other screens in the app

## Streaming Architecture

### Extending Existing Infrastructure
The Compare feature builds on the existing streaming infrastructure:

```typescript
// CompareStreamManager.ts - Extends existing StreamingService
import { getStreamingService } from '../../services/streaming/StreamingService';
import { useAIResponsesWithStreaming } from '../../hooks/chat/useAIResponsesWithStreaming';

class CompareStreamManager extends StreamingService {
  // Leverages existing streaming infrastructure
  private streamingService = getStreamingService();
  
  async sendToCompare(
    prompt: string,
    leftAI: AIConfig,
    rightAI: AIConfig,
    onLeftChunk: (chunk: string) => void,
    onRightChunk: (chunk: string) => void
  ) {
    // Create abort controllers for cancellation
    this.leftStream = new AbortController();
    this.rightStream = new AbortController();
    
    // Start both streams concurrently
    const streamPromises = Promise.allSettled([
      this.streamToAI(prompt, leftAI, onLeftChunk, this.leftStream.signal),
      this.streamToAI(prompt, rightAI, onRightChunk, this.rightStream.signal)
    ]);
    
    return streamPromises;
  }
  
  private async streamToAI(
    prompt: string,
    ai: AIConfig,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ) {
    // Use existing adapter infrastructure with getCapabilities()
    const adapter = this.aiService.getAdapter(ai.id);
    const capabilities = adapter.getCapabilities();
    
    // Check streaming support
    if (!capabilities.streaming) {
      // Fall back to non-streaming response
      return this.sendNonStreamingResponse(prompt, ai, onChunk);
    }
    
    // Stream with abort signal
    await adapter.streamCompletion(prompt, {
      onChunk,
      signal,
      model: ai.model,
      parameters: ai.parameters,
    });
  }
  
  cancelStreams() {
    this.leftStream?.abort();
    this.rightStream?.abort();
  }
}
```

### Hook for Compare Streaming
```typescript
// useCompareStreaming.ts - Extends existing streaming patterns
import { useAIResponsesWithStreaming } from '../../hooks/chat/useAIResponsesWithStreaming';
import { selectStreamingSpeed } from '../../store/streamingSlice';

export const useCompareStreaming = () => {
  // Leverage existing streaming infrastructure
  const baseStreaming = useAIResponsesWithStreaming();
  const streamingSpeed = useSelector(selectStreamingSpeed);
  const dispatch = useDispatch();
  const manager = useRef(new CompareStreamManager());
  
  const sendComparePrompt = useCallback(async (
    prompt: string,
    leftAI: AIConfig,
    rightAI: AIConfig
  ) => {
    const promptId = generateId();
    
    // Initialize streaming state
    dispatch(compareActions.sendPrompt({ id: promptId, text: prompt }));
    dispatch(compareActions.startStreaming({ 
      promptId, 
      side: 'both' 
    }));
    
    try {
      await manager.current.sendToCompare(
        prompt,
        leftAI,
        rightAI,
        (chunk) => dispatch(compareActions.updateStreamingContent({
          promptId,
          side: 'left',
          chunk
        })),
        (chunk) => dispatch(compareActions.updateStreamingContent({
          promptId,
          side: 'right',
          chunk
        }))
      );
    } catch (error) {
      dispatch(compareActions.streamingError({
        promptId,
        error: error.message
      }));
    }
  }, [dispatch]);
  
  const cancelComparison = useCallback(() => {
    manager.current.cancelStreams();
  }, []);
  
  return { sendComparePrompt, cancelComparison };
};
```

## Platform Considerations

### iOS Specific
```typescript
// iOS keyboard handling
const CompareScreen = () => {
  return (
    <KeyboardAvoidingView 
      behavior="padding"
      style={styles.container}
      keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Content */}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};
```

### Android Specific
```typescript
// Android keyboard configuration
// In android/app/src/main/AndroidManifest.xml
android:windowSoftInputMode="adjustResize"

// Handle Android back button
useFocusEffect(
  useCallback(() => {
    const onBackPress = () => {
      if (isComparing) {
        Alert.alert(
          'Cancel Comparison?',
          'This will stop the current comparison.',
          [
            { text: 'Continue', style: 'cancel' },
            { text: 'Stop', onPress: () => cancelComparison() }
          ]
        );
        return true;
      }
      return false;
    };
    
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );
    
    return () => subscription.remove();
  }, [isComparing, cancelComparison])
);
```

### Tablet Optimizations
```typescript
// Detect device type
const isTablet = () => {
  const { width, height } = Dimensions.get('window');
  const aspectRatio = height / width;
  return Math.min(width, height) >= 600 && aspectRatio < 1.6;
};

// Tablet-specific features
if (isTablet()) {
  // Enable resizable panels
  // Show more metadata
  // Allow 3-column layout in landscape
}
```

## Performance Optimization

### Leveraging Existing Optimizations
The Compare feature benefits from existing app optimizations:
- **React Native Reanimated**: Smooth animations for header and transitions
- **Redux Toolkit**: Optimized state updates with Immer
- **Memoization**: Using existing patterns from chat components

### Memory Management
```typescript
// Clean up streaming data after completion
useEffect(() => {
  if (!isStreaming && responses.left && responses.right) {
    // Clear streaming buffers after 30 seconds
    const cleanup = setTimeout(() => {
      dispatch(compareActions.clearStreamingBuffers());
    }, 30000);
    
    return () => clearTimeout(cleanup);
  }
}, [isStreaming, responses]);
```

### Virtualization for Long Responses
```typescript
// Use FlashList for better performance with long responses
import { FlashList } from '@shopify/flash-list';

const CompareResponsePanel = ({ response, isStreaming }) => {
  const chunks = useMemo(() => 
    response.split('\n').map((line, index) => ({
      id: `line-${index}`,
      content: line
    })),
    [response]
  );
  
  return (
    <FlashList
      data={chunks}
      renderItem={({ item }) => <Text>{item.content}</Text>}
      estimatedItemSize={50}
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
      }}
    />
  );
};
```

### Streaming Optimization
```typescript
// Batch updates to reduce re-renders
const useStreamingBatch = (onUpdate: (content: string) => void) => {
  const buffer = useRef('');
  const timeout = useRef<NodeJS.Timeout>();
  
  const addChunk = useCallback((chunk: string) => {
    buffer.current += chunk;
    
    if (timeout.current) clearTimeout(timeout.current);
    
    timeout.current = setTimeout(() => {
      onUpdate(buffer.current);
      buffer.current = '';
    }, 16); // ~60fps
  }, [onUpdate]);
  
  return addChunk;
};
```

### Lazy Loading
```typescript
// Lazy load heavy components
const CompareAISelector = React.lazy(() => 
  import('../components/organisms/compare/CompareAISelector')
);

// In CompareScreen
<React.Suspense fallback={<ActivityIndicator />}>
  <CompareAISelector {...props} />
</React.Suspense>
```

## Accessibility

### Screen Reader Support
```typescript
const CompareResponsePanel = ({ ai, response, position }) => {
  return (
    <View
      accessible={true}
      accessibilityLabel={`${ai.name} response panel`}
      accessibilityHint={`${position} side of comparison`}
      accessibilityRole="text"
    >
      <ScrollView
        accessible={true}
        accessibilityLabel={`${ai.name} response content`}
      >
        <Text accessibilityLiveRegion="polite">
          {response}
        </Text>
      </ScrollView>
    </View>
  );
};
```

### Keyboard Navigation
```typescript
// Support keyboard shortcuts
const useKeyboardShortcuts = () => {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSend();
      }
      // Cmd/Ctrl + K to clear
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        clearComparison();
      }
    };
    
    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, []);
};
```

### Dynamic Font Scaling
```typescript
// Respect system font size preferences
const CompareResponseBubble = ({ content }) => {
  const { fontScale } = useWindowDimensions();
  
  return (
    <Text
      style={[
        styles.responseText,
        { fontSize: 14 * fontScale }
      ]}
      allowFontScaling={true}
      maxFontSizeMultiplier={1.5}
    >
      {content}
    </Text>
  );
};
```

### Voice Control
```typescript
// VoiceOver/TalkBack announcements
const announceComparison = (leftAI: string, rightAI: string) => {
  AccessibilityInfo.announceForAccessibility(
    `Starting comparison between ${leftAI} and ${rightAI}`
  );
};
```

## Testing Strategy

### Alignment with Existing Test Patterns
Tests follow the established patterns in the codebase:
- **Zero TypeScript errors**: Strict type checking enforced
- **Zero ESLint warnings**: All linting rules must pass
- **Component testing**: Follow existing Jest patterns

### Unit Tests
```typescript
// CompareService.test.ts
describe('CompareService', () => {
  it('should validate exactly 2 AI selections', () => {
    expect(() => CompareService.validateSelection([ai1])).toThrow();
    expect(() => CompareService.validateSelection([ai1, ai2, ai3])).toThrow();
    expect(() => CompareService.validateSelection([ai1, ai2])).not.toThrow();
  });
  
  it('should handle concurrent streaming', async () => {
    const results = await CompareService.sendToCompare(prompt, ai1, ai2);
    expect(results).toHaveLength(2);
  });
});
```

### Integration Tests
```typescript
// CompareScreen.integration.test.tsx
describe('CompareScreen Integration', () => {
  it('should display both AI responses', async () => {
    const { getByText, getAllByTestId } = render(<CompareScreen />);
    
    // Select AIs
    fireEvent.press(getByText('Select First AI'));
    fireEvent.press(getByText('Claude'));
    fireEvent.press(getByText('Select Second AI'));
    fireEvent.press(getByText('GPT-4'));
    
    // Send prompt
    const input = getByTestId('compare-input');
    fireEvent.changeText(input, 'Test prompt');
    fireEvent.press(getByText('Send'));
    
    // Wait for responses
    await waitFor(() => {
      const panels = getAllByTestId('response-panel');
      expect(panels).toHaveLength(2);
    });
  });
});
```

### E2E Tests with Detox
```typescript
// compare.e2e.ts
describe('Compare Feature E2E', () => {
  beforeAll(async () => {
    await device.launchApp();
  });
  
  it('should complete full comparison flow', async () => {
    // Navigate to Compare tab
    await element(by.id('tab-compare')).tap();
    
    // Select AIs
    await element(by.id('select-left-ai')).tap();
    await element(by.text('Claude')).tap();
    await element(by.id('select-right-ai')).tap();
    await element(by.text('GPT-4')).tap();
    
    // Type and send
    await element(by.id('compare-input')).typeText('Explain quantum computing');
    await element(by.id('send-button')).tap();
    
    // Verify streaming
    await expect(element(by.id('left-streaming-indicator'))).toBeVisible();
    await expect(element(by.id('right-streaming-indicator'))).toBeVisible();
    
    // Wait for completion
    await waitFor(element(by.id('left-response-complete')))
      .toBeVisible()
      .withTimeout(30000);
  });
});
```

### Performance Tests
```typescript
// Compare.performance.test.ts
describe('Compare Performance', () => {
  it('should handle large responses without lag', async () => {
    const largeResponse = 'x'.repeat(10000);
    const startTime = performance.now();
    
    renderResponse(largeResponse);
    
    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(100); // < 100ms
  });
  
  it('should maintain 60fps during streaming', async () => {
    const fps = await measureFPS(() => {
      streamResponse(mockChunks);
    });
    
    expect(fps).toBeGreaterThan(55);
  });
});
```

## Implementation Roadmap

### Phase 0: Current State (Completed)
- ✅ Compare tab added to AppNavigator with git-compare icon
- ✅ CompareScreen placeholder created in organisms/navigation
- ✅ Navigation integration complete
- ✅ Basic "Coming Soon" UI implemented

### Phase 1: Foundation (Week 1)
- [ ] Create compareSlice in Redux store following existing patterns
- [ ] Enhance CompareScreen with gradient header integration
- [ ] Implement CompareAISelector extending DynamicAISelector patterns
- [ ] Add ProfileIcon and HeaderActions integration
- [ ] Ensure SafeAreaView proper edge handling

### Phase 2: Core Components (Week 2)
- [ ] Integrate existing Header component with dynamic states
- [ ] Create CompareResponsePanel using MessageBubble patterns
- [ ] Implement CompareInputBar extending ChatInputBar
- [ ] Add CompareDivider molecule following theme spacing
- [ ] Create CompareEmptyState with consistent design language

### Phase 3: Streaming Integration (Week 3)
- [ ] Extend existing StreamingService for compare functionality
- [ ] Create useCompareStreaming hook leveraging useAIResponsesWithStreaming
- [ ] Add concurrent streaming using existing adapter getCapabilities()
- [ ] Implement streaming indicators consistent with chat
- [ ] Integrate with existing error handling patterns

### Phase 4: UX Enhancements (Week 4)
- [ ] Add sync scroll functionality
- [ ] Implement orientation handling
- [ ] Add swipe gestures for AI swapping
- [ ] Create comparison history
- [ ] Add share comparison feature

### Phase 5: Testing & Polish (Week 5)
- [ ] Write unit tests for all components
- [ ] Add integration tests
- [ ] Implement E2E tests with Detox
- [ ] Performance optimization
- [ ] Accessibility audit and fixes

### Phase 6: Launch Preparation (Week 6)
- [ ] Update CLAUDE.md with compare feature documentation
- [ ] Ensure TypeScript compilation with ZERO errors
- [ ] Ensure ESLint passes with ZERO warnings
- [ ] Test on both iOS and Android platforms
- [ ] Final integration testing with all existing features

## Integration Checklist

### Pre-Implementation (Completed)
- ✅ Review existing Header component with gradient variant
- ✅ Understand HeaderActions and ProfileIcon integration
- ✅ Review useAIResponsesWithStreaming implementation
- ✅ Validate atomic design structure (organisms/molecules/atoms)
- ✅ Check existing Redux patterns (sheets, navigation)

### During Implementation
- [ ] Maintain zero TypeScript errors (enforced by CLAUDE.md)
- [ ] Ensure zero ESLint warnings (enforced by CLAUDE.md)
- [ ] Follow atomic design principles (atoms → molecules → organisms)
- [ ] Use existing theme system consistently
- [ ] Integrate with existing Redux patterns
- [ ] Leverage existing streaming infrastructure
- [ ] Test gradient header integration
- [ ] Ensure ProfileIcon and HeaderActions work correctly

### Post-Implementation
- [ ] Update CLAUDE.md with compare feature details
- [ ] Ensure all components follow established patterns
- [ ] Verify gradient header animations work smoothly
- [ ] Test sheet/modal interactions (settings, profile)
- [ ] Confirm streaming works with existing adapters
- [ ] Update App Store/Play Store descriptions
- [ ] Add to feature highlights in app documentation

## Best Practices & Guidelines

### Component Guidelines (Aligned with CLAUDE.md)
1. **Atomic Design Compliance**: 
   - Atoms: Pure wrappers (only Box.tsx)
   - Molecules: Simple combinations (Button, Typography, etc.)
   - Organisms: Complex business logic (CompareScreen in organisms/navigation)
2. **TypeScript Safety**: Zero compilation errors enforced
3. **ESLint Compliance**: Zero warnings or errors required
4. **Existing Patterns**: 
   - Use gradient Header variant for visual consistency
   - Integrate HeaderActions for settings access
   - Follow SafeAreaView edge patterns
   - Use theme.spacing and theme.colors consistently
5. **Performance**: Leverage React Native Reanimated for smooth animations

### State Management (Following Redux Patterns)
1. **Redux Integration**: 
   - Create compareSlice following existing slice patterns
   - Integrate with navigationSlice for sheets/modals
   - Use existing showSheet patterns for settings
2. **Streaming State**: Extend streamingSlice patterns for compare
3. **Session Management**: Similar to chat sessions but for comparisons
4. **Sheet Management**: Use existing ProfileSheet and UnifiedSettings patterns

### Platform Specific
1. **iOS**: Use native iOS transitions and gestures
2. **Android**: Follow Material Design guidelines
3. **Tablets**: Utilize extra screen space effectively
4. **Orientation**: Test all orientations thoroughly

### Testing Requirements
1. **Coverage**: Minimum 80% code coverage
2. **E2E**: Cover critical user paths
3. **Performance**: Test with slow network conditions
4. **Accessibility**: Test with screen readers

## Technical Integration Points

### Key Integration Areas
1. **Header Component**: 
   - Already supports gradient variant with animations
   - Integrates ProfileIcon and HeaderActions
   - Handles showTime, showDate, animated props
   
2. **Streaming Infrastructure**:
   - useAIResponsesWithStreaming provides base functionality
   - StreamingService handles stream management
   - Adapter getCapabilities() determines streaming support
   
3. **Redux Patterns**:
   - Sheet management through navigationSlice
   - Settings access via showSheet action
   - Profile sheet integration established
   
4. **Design System**:
   - Gradient headers with time/date display
   - Consistent spacing using theme.spacing
   - SafeAreaView with proper edge handling
   - Theme-aware color system

### Future Enhancements
1. **Multi-round comparisons**: Continue conversation with both AIs
2. **Comparison templates**: Save common comparison setups
3. **Export comparisons**: PDF/image export functionality
4. **Advanced filtering**: Filter by response characteristics
5. **Comparison analytics**: Track which AI performs better
6. **Group comparisons**: Compare more than 2 AIs (tablet only)

## Security Considerations

### API Key Management
- Validate both AIs have valid API keys before comparison
- Handle API key errors gracefully
- Never expose keys in comparison exports

### Rate Limiting
- Implement client-side rate limiting
- Queue rapid comparisons
- Show clear feedback when rate limited

### Data Privacy
- Comparisons stored locally only
- Optional cloud sync with encryption
- Clear data on app uninstall

## Conclusion

The Compare feature implementation is designed as a natural extension of the existing Symposium AI architecture, not a bolt-on addition. By leveraging the gradient header design, existing streaming infrastructure, and established Redux patterns, the feature maintains complete consistency with the app's design language and user experience.

### Key Integration Achievements:
1. **Visual Consistency**: Uses the same gradient header pattern as HomeScreen
2. **Code Reuse**: Extends existing streaming and AI adapter infrastructure
3. **Pattern Compliance**: Follows atomic design with proper organism placement
4. **Redux Integration**: Uses established sheet and navigation patterns
5. **Theme Alignment**: Consistent spacing, colors, and animations

### Implementation Priorities:
- **Seamless Integration**: Feature feels native to the existing app
- **Design Consistency**: Gradient headers, profile icons, and animations match
- **Code Quality**: Zero TypeScript errors, zero ESLint warnings
- **Performance**: Leverages existing optimizations and patterns
- **User Experience**: Familiar interactions and visual language

### Success Metrics:
- ✅ Zero TypeScript compilation errors (enforced)
- ✅ Zero ESLint warnings (enforced)
- ✅ Seamless gradient header integration
- ✅ Consistent with existing design patterns
- ✅ Proper atomic design structure maintained
- ✅ Full integration with existing infrastructure