import reducer, {
  showSheet,
  hideSheet,
  clearSheet,
  setHeaderTitle,
  setNavigationLoading,
  resetNavigationState,
} from '@/store/navigationSlice';

const initialState = reducer(undefined, { type: 'init' });

describe('navigationSlice', () => {
  it('shows and hides sheets without clearing active sheet', () => {
    let state = reducer(initialState, showSheet({ sheet: 'settings', data: { tab: 'account' } }));
    expect(state.activeSheet).toBe('settings');
    expect(state.sheetVisible).toBe(true);
    expect(state.sheetData).toEqual({ tab: 'account' });

    state = reducer(state, hideSheet());
    expect(state.sheetVisible).toBe(false);
    expect(state.activeSheet).toBe('settings');

    state = reducer(state, clearSheet());
    expect(state.activeSheet).toBeNull();
  });

  it('updates header metadata and loading state', () => {
    let state = reducer(initialState, setHeaderTitle('Debate'));
    expect(state.headerTitle).toBe('Debate');

    state = reducer(state, setNavigationLoading(true));
    expect(state.isLoading).toBe(true);

    state = reducer(state, resetNavigationState());
    expect(state).toEqual(initialState);
  });
});
