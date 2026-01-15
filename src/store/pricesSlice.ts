import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PriceInfo, FALLBACK_PRICES } from '@/services/prices/PricesPersistenceService';

interface PricesState {
  monthly: PriceInfo;
  annual: PriceInfo;
  lifetime: PriceInfo;
  loaded: boolean;
}

const initialState: PricesState = {
  ...FALLBACK_PRICES,
  loaded: false,
};

const pricesSlice = createSlice({
  name: 'prices',
  initialState,
  reducers: {
    setPrices(state, action: PayloadAction<{
      monthly: PriceInfo;
      annual: PriceInfo;
      lifetime: PriceInfo;
    }>) {
      state.monthly = action.payload.monthly;
      state.annual = action.payload.annual;
      state.lifetime = action.payload.lifetime;
      state.loaded = true;
    },
  },
});

export const { setPrices } = pricesSlice.actions;
export default pricesSlice.reducer;
