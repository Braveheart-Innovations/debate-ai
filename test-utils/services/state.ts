import { createAppStore, store, type RootState } from '@/store';

type PartialRootState = Partial<RootState>;

export const buildRootState = (overrides: PartialRootState = {}): RootState => {
  const baseState = createAppStore().getState();
  const nextState = { ...baseState } as RootState;

  for (const key of Object.keys(overrides) as Array<keyof RootState>) {
    const override = overrides[key];
    if (override && typeof override === 'object' && !Array.isArray(override)) {
      nextState[key] = {
        ...(baseState[key] as Record<string, unknown>),
        ...(override as Record<string, unknown>),
      } as RootState[typeof key];
    } else {
      nextState[key] = override as RootState[typeof key];
    }
  }

  return nextState;
};

export const mockStoreState = (overrides: PartialRootState = {}): jest.SpiedFunction<typeof store.getState> => {
  const state = buildRootState(overrides);
  return jest.spyOn(store, 'getState').mockReturnValue(state);
};
