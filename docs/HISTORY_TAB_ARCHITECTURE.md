# History Tab Architecture - Symposium AI

## Executive Summary

Complete architectural redesign of the History tab to support three interaction types (Chats, Comparisons, Debates) with tiered storage management. This is a fresh implementation with no migration requirements - all test data will be flushed.

## 1. Data Architecture

### 1.1 Core Data Models

```typescript
// Base session interface for all interaction types
interface BaseSession {
  id: string;
  type: 'chat' | 'comparison' | 'debate';
  title: string;
  timestamp: Date;
  lastModified: Date;
  aiProviders: string[]; // Array of AI provider IDs
  messageCount: number;
  preview: string; // Last message or debate topic
  isPinned?: boolean; // Premium feature
  tags?: string[]; // Premium feature
}

// Chat-specific session
interface ChatSession extends BaseSession {
  type: 'chat';
  messages: ChatMessage[];
  selectedPersonality?: string;
  model?: string; // For expert mode
}

// Comparison-specific session
interface ComparisonSession extends BaseSession {
  type: 'comparison';
  hasDiverged: boolean;
  divergedAt?: Date;
  continuedWithAI?: string; // Which AI was selected if diverged
  leftThread: ChatMessage[];
  rightThread: ChatMessage[];
  leftAI: string;
  rightAI: string;
  sharedPrompts: string[]; // Prompts sent to both AIs
}

// Debate-specific session (read-only)
interface DebateSession extends BaseSession {
  type: 'debate';
  topic: string;
  winner: string;
  scores: {
    [aiId: string]: {
      points: number;
      rounds: RoundScore[];
    };
  };
  transcript: DebateTranscript;
  duration: number; // in seconds
  roundCount: number;
}

// Supporting types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  aiProvider?: string; // Which AI responded
  error?: string;
}

interface RoundScore {
  round: number;
  score: number;
  reasoning: string;
}

interface DebateTranscript {
  rounds: DebateRound[];
  judgements: string[];
  finalVerdict: string;
}
```

### 1.2 Storage Schema

```typescript
// Storage structure in AsyncStorage/Redux
interface HistoryStorage {
  chats: {
    items: ChatSession[];
    count: number;
    lastCleanup: Date;
  };
  comparisons: {
    items: ComparisonSession[];
    count: number;
    lastCleanup: Date;
  };
  debates: {
    items: DebateSession[];
    count: number;
    lastCleanup: Date;
  };
  metadata: {
    totalSize: number; // in bytes
    lastAccessed: Date;
    version: string;
  };
}
```

## 2. Storage Management Service

### 2.1 Core Service Architecture

```typescript
class StorageManagementService {
  // Storage limits by tier
  private readonly LIMITS = {
    free: {
      chats: 3,
      comparisons: 3,
      debates: 3,
    },
    premium: {
      chats: Infinity,
      comparisons: Infinity,
      debates: Infinity,
    }
  };

  // Core methods
  async addSession(session: BaseSession, userTier: 'free' | 'premium'): Promise<void>;
  async deleteSession(sessionId: string, type: SessionType): Promise<void>;
  async archiveSession(sessionId: string): Promise<void>; // Premium only
  async getStorageStatus(type: SessionType, userTier: 'free' | 'premium'): StorageStatus;
  
  // Auto-cleanup for free tier
  private async enforceStorageLimits(type: SessionType): Promise<void>;
  private async deleteOldestSession(type: SessionType): Promise<string>; // Returns deleted ID
  
  // Storage analytics
  async calculateStorageSize(): Promise<number>;
  async getStorageBreakdown(): Promise<StorageBreakdown>;
}

interface StorageStatus {
  current: number;
  limit: number;
  percentUsed: number;
  willAutoDelete: boolean;
  oldestItemDate?: Date;
}
```

### 2.2 Auto-Cleanup Strategy

```typescript
// Implementation for free tier auto-cleanup
class AutoCleanupManager {
  async onBeforeAdd(type: SessionType): Promise<CleanupResult> {
    const status = await this.getStorageStatus(type, 'free');
    
    if (status.current >= status.limit) {
      // Delete oldest item
      const deletedId = await this.deleteOldestSession(type);
      
      return {
        cleaned: true,
        deletedId,
        message: `Oldest ${type} deleted to make room`
      };
    }
    
    return { cleaned: false };
  }
  
  // Sort by: isPinned (premium) > lastModified > timestamp
  private getSortedSessions(sessions: BaseSession[]): BaseSession[] {
    return sessions.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? 1 : -1;
      return a.lastModified.getTime() - b.lastModified.getTime();
    });
  }
}
```

## 3. Redux State Management

### 3.1 Store Structure

```typescript
// Redux store slices
interface RootState {
  history: {
    chats: ChatSession[];
    comparisons: ComparisonSession[];
    debates: DebateSession[];
    activeFilters: FilterState;
    sortOrder: 'recent' | 'oldest' | 'alphabetical';
    searchQuery: string;
  };
  historyMetadata: {
    storageCounts: {
      chats: number;
      comparisons: number;
      debates: number;
    };
    lastSync: Date;
    isLoading: boolean;
    error: string | null;
  };
  subscription: {
    tier: 'free' | 'premium';
    features: string[];
  };
}
```

### 3.2 Redux Slices

```typescript
// historySlice.ts
const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    // Session management
    addSession: (state, action: PayloadAction<BaseSession>) => {},
    removeSession: (state, action: PayloadAction<{id: string, type: SessionType}>) => {},
    updateSession: (state, action: PayloadAction<BaseSession>) => {},
    
    // Bulk operations
    clearHistory: (state, action: PayloadAction<SessionType>) => {},
    flushAllData: (state) => {}, // For testing
    
    // Comparison-specific
    markComparisonDiverged: (state, action: PayloadAction<{id: string, aiId: string}>) => {},
    
    // Filtering and sorting
    setFilter: (state, action: PayloadAction<FilterState>) => {},
    setSortOrder: (state, action: PayloadAction<SortOrder>) => {},
    setSearchQuery: (state, action: PayloadAction<string>) => {},
  },
  extraReducers: (builder) => {
    // Handle async thunks
    builder.addCase(loadHistoryFromStorage.fulfilled, (state, action) => {});
    builder.addCase(syncToStorage.fulfilled, (state, action) => {});
  }
});

// Async thunks
export const loadHistoryFromStorage = createAsyncThunk('history/load', async () => {});
export const syncToStorage = createAsyncThunk('history/sync', async (state: RootState) => {});
export const enforceStorageLimits = createAsyncThunk('history/enforce', async (type: SessionType) => {});
```

## 4. Component Architecture

### 4.1 Component Hierarchy

```
organisms/
├── history/
│   ├── HistoryContainer.tsx         // Main container with tabs
│   ├── HistoryList.tsx             // Generic list component
│   ├── HistoryFilters.tsx          // Filter bar component
│   ├── StorageIndicator.tsx        // Shows usage for free tier
│   ├── items/
│   │   ├── ChatHistoryItem.tsx     // Chat-specific list item
│   │   ├── ComparisonHistoryItem.tsx // Comparison list item
│   │   └── DebateHistoryItem.tsx   // Debate list item
│   └── actions/
│       ├── SwipeActions.tsx        // Swipe to delete/archive
│       └── ItemActions.tsx         // Action buttons

molecules/
├── HistoryTab.tsx                  // Tab selector component
├── HistoryCard.tsx                 // Base card for list items
├── StorageBar.tsx                  // Visual storage indicator
└── EmptyHistory.tsx                // Empty state component
```

### 4.2 Main Container Component

```typescript
// organisms/history/HistoryContainer.tsx
interface HistoryContainerProps {
  navigation: NavigationProp;
}

const HistoryContainer: React.FC<HistoryContainerProps> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<SessionType>('chat');
  const { tier } = useSelector((state: RootState) => state.subscription);
  const history = useSelector((state: RootState) => state.history);
  const storageCounts = useSelector((state: RootState) => state.historyMetadata.storageCounts);
  
  const handleResume = useCallback((session: BaseSession) => {
    switch (session.type) {
      case 'chat':
        navigation.navigate('Chat', { sessionId: session.id });
        break;
      case 'comparison':
        const comparison = session as ComparisonSession;
        if (comparison.hasDiverged) {
          // Resume as chat with the selected AI
          navigation.navigate('Chat', { 
            sessionId: session.id,
            aiProvider: comparison.continuedWithAI 
          });
        } else {
          // Resume comparison mode
          navigation.navigate('Compare', { sessionId: session.id });
        }
        break;
      case 'debate':
        // View-only
        navigation.navigate('DebateViewer', { sessionId: session.id });
        break;
    }
  }, [navigation]);
  
  return (
    <View style={styles.container}>
      {tier === 'free' && (
        <StorageIndicator 
          counts={storageCounts}
          limits={LIMITS.free}
          onUpgrade={() => navigation.navigate('Premium')}
        />
      )}
      
      <HistoryTabs 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={storageCounts}
      />
      
      <HistoryList
        type={activeTab}
        sessions={history[activeTab]}
        onResume={handleResume}
        onDelete={handleDelete}
        onArchive={tier === 'premium' ? handleArchive : undefined}
      />
    </View>
  );
};
```

### 4.3 List Item Components

```typescript
// organisms/history/items/ComparisonHistoryItem.tsx
interface ComparisonHistoryItemProps {
  session: ComparisonSession;
  onResume: (session: ComparisonSession) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
}

const ComparisonHistoryItem: React.FC<ComparisonHistoryItemProps> = ({
  session,
  onResume,
  onDelete,
  onArchive
}) => {
  const theme = useTheme();
  
  return (
    <SwipeableRow
      rightActions={[
        { label: 'Delete', color: theme.colors.error, onPress: () => onDelete(session.id) },
        onArchive && { label: 'Archive', color: theme.colors.primary, onPress: () => onArchive(session.id) }
      ].filter(Boolean)}
    >
      <HistoryCard onPress={() => onResume(session)}>
        <View style={styles.header}>
          <View style={styles.aiPair}>
            <AIAvatar provider={session.leftAI} size="small" />
            <Typography variant="caption" style={styles.vs}>VS</Typography>
            <AIAvatar provider={session.rightAI} size="small" />
          </View>
          {session.hasDiverged && (
            <Badge text="Diverged" color={theme.colors.warning} />
          )}
        </View>
        
        <Typography variant="body" numberOfLines={2}>
          {session.preview}
        </Typography>
        
        <View style={styles.footer}>
          <Typography variant="caption" color="secondary">
            {formatRelativeTime(session.lastModified)}
          </Typography>
          <Typography variant="caption" color="secondary">
            {session.messageCount} messages
          </Typography>
        </View>
      </HistoryCard>
    </SwipeableRow>
  );
};
```

## 5. Storage Indicator UI

### 5.1 Free Tier Storage Indicator

```typescript
// organisms/history/StorageIndicator.tsx
interface StorageIndicatorProps {
  counts: StorageCounts;
  limits: StorageLimits;
  onUpgrade: () => void;
}

const StorageIndicator: React.FC<StorageIndicatorProps> = ({
  counts,
  limits,
  onUpgrade
}) => {
  const theme = useTheme();
  const totalUsed = counts.chats + counts.comparisons + counts.debates;
  const totalLimit = limits.chats + limits.comparisons + limits.debates;
  const percentUsed = (totalUsed / totalLimit) * 100;
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Typography variant="caption" color="secondary">
          Storage: {totalUsed}/{totalLimit} items
        </Typography>
        <TouchableOpacity onPress={onUpgrade}>
          <Typography variant="caption" color="primary">
            Upgrade for unlimited
          </Typography>
        </TouchableOpacity>
      </View>
      
      <StorageBar 
        segments={[
          { value: counts.chats, max: limits.chats, color: theme.colors.primary },
          { value: counts.comparisons, max: limits.comparisons, color: theme.colors.secondary },
          { value: counts.debates, max: limits.debates, color: theme.colors.accent }
        ]}
      />
      
      {percentUsed >= 80 && (
        <Typography variant="caption" color="warning" style={styles.warning}>
          ⚠️ Storage nearly full - oldest items will be auto-deleted
        </Typography>
      )}
    </View>
  );
};
```

## 6. Resume & Continuation Logic

### 6.1 Resume Strategies

```typescript
class ResumeManager {
  // Chat resume - straightforward
  async resumeChat(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId, 'chat');
    await this.navigation.navigate('Chat', {
      sessionId,
      messages: session.messages,
      aiProvider: session.aiProviders[0]
    });
  }
  
  // Comparison resume - check divergence
  async resumeComparison(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId, 'comparison') as ComparisonSession;
    
    if (session.hasDiverged) {
      // Convert to chat with selected AI
      await this.navigation.navigate('Chat', {
        sessionId,
        messages: session.continuedWithAI === session.leftAI 
          ? session.leftThread 
          : session.rightThread,
        aiProvider: session.continuedWithAI
      });
    } else {
      // Resume comparison mode
      await this.navigation.navigate('Compare', {
        sessionId,
        leftThread: session.leftThread,
        rightThread: session.rightThread,
        leftAI: session.leftAI,
        rightAI: session.rightAI
      });
    }
  }
  
  // Debate view - read-only
  async viewDebate(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId, 'debate');
    await this.navigation.navigate('DebateViewer', {
      sessionId,
      debate: session
    });
  }
}
```

### 6.2 Divergence Handling

```typescript
// Handle comparison divergence when user selects "Continue with this AI"
class DivergenceHandler {
  async markDiverged(
    sessionId: string, 
    selectedAI: string
  ): Promise<void> {
    // Update session
    dispatch(markComparisonDiverged({
      id: sessionId,
      aiId: selectedAI
    }));
    
    // Create notification for user
    showToast({
      message: 'Comparison diverged - continuing with ' + selectedAI,
      type: 'info'
    });
    
    // Navigate to chat mode
    navigation.navigate('Chat', {
      sessionId,
      aiProvider: selectedAI,
      fromComparison: true
    });
  }
}
```

## 7. Implementation Phases

### Phase 1: Data Layer (Week 1)
- [ ] Define TypeScript interfaces for all session types
- [ ] Create StorageManagementService class
- [ ] Implement Redux slices for history
- [ ] Set up AsyncStorage persistence layer
- [ ] Create migration utility to flush old data

### Phase 2: Chat System Update (Week 1-2)
- [ ] Update existing chat storage to new BaseSession format
- [ ] Implement chat session CRUD operations
- [ ] Add storage limit enforcement for free tier
- [ ] Test chat resume functionality
- [ ] Verify auto-deletion works correctly

### Phase 3: Debate Integration (Week 2)
- [ ] Create DebateSession storage handlers
- [ ] Build DebateViewer screen for transcript display
- [ ] Implement debate history items
- [ ] Add rematch functionality
- [ ] Test debate storage limits

### Phase 4: Comparison System (Week 2-3)
- [ ] Implement ComparisonSession storage
- [ ] Build divergence detection and handling
- [ ] Create comparison resume logic
- [ ] Add "Continue with this AI" flow
- [ ] Test comparison to chat conversion

### Phase 5: UI Components (Week 3)
- [ ] Build HistoryContainer with tabs
- [ ] Create type-specific list items
- [ ] Implement swipe actions for delete/archive
- [ ] Add storage indicators for free tier
- [ ] Build empty states and loading states

### Phase 6: Premium Features (Week 3-4)
- [ ] Implement unlimited storage for premium
- [ ] Add pin functionality
- [ ] Create archive system
- [ ] Add search and filtering
- [ ] Build bulk operations UI

### Phase 7: Testing & Polish (Week 4)
- [ ] Flush all test data
- [ ] Test fresh installation flow
- [ ] Verify storage limits work correctly
- [ ] Test all resume scenarios
- [ ] Performance optimization
- [ ] Accessibility testing

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// StorageManagementService.test.ts
describe('StorageManagementService', () => {
  it('should enforce free tier limits', async () => {
    const service = new StorageManagementService('free');
    
    // Add 4 chats (limit is 3)
    for (let i = 0; i < 4; i++) {
      await service.addSession(createMockChat(i));
    }
    
    const status = await service.getStorageStatus('chat', 'free');
    expect(status.current).toBe(3);
    expect(deletedSessions).toHaveLength(1);
  });
  
  it('should not delete premium user sessions', async () => {
    const service = new StorageManagementService('premium');
    
    // Add 100 chats
    for (let i = 0; i < 100; i++) {
      await service.addSession(createMockChat(i));
    }
    
    const status = await service.getStorageStatus('chat', 'premium');
    expect(status.current).toBe(100);
  });
});
```

### 8.2 Integration Tests

```typescript
// HistoryFlow.test.tsx
describe('History Flow Integration', () => {
  it('should resume diverged comparison as chat', async () => {
    const { getByTestId } = render(<App />);
    
    // Create comparison that diverged
    const comparison = createDivergedComparison();
    await storage.saveSession(comparison);
    
    // Navigate to history
    fireEvent.press(getByTestId('history-tab'));
    
    // Select comparisons tab
    fireEvent.press(getByTestId('comparisons-tab'));
    
    // Resume comparison
    fireEvent.press(getByTestId(`resume-${comparison.id}`));
    
    // Should navigate to Chat screen with selected AI
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      sessionId: comparison.id,
      aiProvider: comparison.continuedWithAI
    });
  });
});
```

## 9. Migration & Data Flush

### 9.1 Data Flush Utility

```typescript
// utils/dataFlush.ts
export class DataFlushUtility {
  static async flushAllTestData(): Promise<void> {
    // Clear AsyncStorage
    await AsyncStorage.multiRemove([
      '@history_chats',
      '@history_comparisons',
      '@history_debates',
      '@history_metadata'
    ]);
    
    // Reset Redux store
    store.dispatch(flushAllData());
    
    // Clear any cached files
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    
    // Initialize fresh storage
    await this.initializeFreshStorage();
    
    console.log('All test data flushed successfully');
  }
  
  static async initializeFreshStorage(): Promise<void> {
    const freshState: HistoryStorage = {
      chats: { items: [], count: 0, lastCleanup: new Date() },
      comparisons: { items: [], count: 0, lastCleanup: new Date() },
      debates: { items: [], count: 0, lastCleanup: new Date() },
      metadata: {
        totalSize: 0,
        lastAccessed: new Date(),
        version: '2.0.0'
      }
    };
    
    await AsyncStorage.setItem('@history_storage', JSON.stringify(freshState));
  }
}
```

## 10. Performance Considerations

### 10.1 Optimization Strategies

1. **Lazy Loading**: Load session details only when needed
2. **Pagination**: Show 20 items at a time with infinite scroll
3. **Virtualized Lists**: Use FlatList with getItemLayout
4. **Debounced Search**: 300ms debounce on search input
5. **Memoization**: Use React.memo for list items
6. **Selective Re-renders**: Use Redux selectors efficiently

### 10.2 Storage Size Management

```typescript
class StorageSizeManager {
  private readonly MAX_MESSAGE_LENGTH = 1000; // Truncate long messages
  private readonly MAX_DEBATE_TRANSCRIPT = 5000; // Truncate long debates
  
  async compressSession(session: BaseSession): Promise<BaseSession> {
    if (session.type === 'chat') {
      return this.compressChatSession(session as ChatSession);
    }
    // Similar for other types
  }
  
  private compressChatSession(session: ChatSession): ChatSession {
    return {
      ...session,
      messages: session.messages.map(msg => ({
        ...msg,
        content: msg.content.substring(0, this.MAX_MESSAGE_LENGTH)
      }))
    };
  }
}
```

## 11. Error Handling

### 11.1 Storage Error Recovery

```typescript
class ErrorRecoveryService {
  async handleStorageError(error: Error, operation: string): Promise<void> {
    console.error(`Storage error during ${operation}:`, error);
    
    if (error.message.includes('quota exceeded')) {
      // Free tier: auto-cleanup
      if (this.userTier === 'free') {
        await this.emergencyCleanup();
        showToast({
          message: 'Storage full - oldest items deleted',
          type: 'warning'
        });
      } else {
        // Premium: prompt to manage storage
        navigation.navigate('StorageManagement');
      }
    } else if (error.message.includes('corrupted')) {
      // Attempt recovery
      await this.recoverFromCorruption();
    }
  }
  
  private async emergencyCleanup(): Promise<void> {
    // Delete 50% of oldest items
    const sessions = await this.getAllSessions();
    const toDelete = Math.floor(sessions.length / 2);
    
    for (let i = 0; i < toDelete; i++) {
      await this.deleteSession(sessions[i].id);
    }
  }
}
```

## 12. Accessibility

### 12.1 Accessibility Features

1. **Screen Reader Support**
   - Proper labels for all interactive elements
   - Announce storage warnings
   - Describe session types clearly

2. **Keyboard Navigation**
   - Tab through history items
   - Keyboard shortcuts for actions
   - Focus management on tab changes

3. **Visual Indicators**
   - High contrast mode support
   - Clear type differentiation
   - Status badges for diverged comparisons

## Conclusion

This architecture provides a clean, scalable foundation for the History tab redesign. Key benefits:

1. **Clean Separation**: Three distinct session types with shared base
2. **Storage Management**: Automatic for free tier, manual for premium
3. **Future-Proof**: Easy to extend with new session types
4. **Performance**: Optimized for large histories with lazy loading
5. **User Experience**: Clear visual indicators and intuitive navigation

The phased implementation approach ensures each component is thoroughly tested before moving to the next phase, with a complete data flush ensuring a clean start for the new system.