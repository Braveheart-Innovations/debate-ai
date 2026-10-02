import { createAppStore, store, type RootState } from '@/store';

/** Per-slice partial overrides, e.g. `{ auth: { isPremium: true } }`. */
export type RootStateOverrides = { [K in keyof RootState]?: Partial<RootState[K]> };

const mergeSlice = <K extends keyof RootState>(
  state: RootState,
  key: K,
  override: Partial<RootState[K]>
): void => {
  state[key] = Object.assign({}, state[key], override);
};

/** The real initial store state with each overridden slice shallow-merged in. */
export const buildRootState = (overrides: RootStateOverrides = {}): RootState => {
  const state: RootState = { ...createAppStore().getState() };
  (Object.keys(overrides) as Array<keyof RootState>).forEach((key) => {
    const override = overrides[key];
    if (override) mergeSlice(state, key, override);
  });
  return state;
};

export const mockStoreState = (
  overrides: RootStateOverrides = {}
): jest.SpiedFunction<typeof store.getState> =>
  jest.spyOn(store, 'getState').mockReturnValue(buildRootState(overrides));
