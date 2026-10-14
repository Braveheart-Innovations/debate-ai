import { act, fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PersonalityOptionGrid } from '@/components/organisms/personality/PersonalityOptionGrid';
import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';

// FlatList (VirtualizedList) schedules batched cell updates on timers. Under a
// loaded parallel run a real timer can fire between assertions, outside act();
// fake timers keep every one of those updates inside an act() flush.
const flushListTimers = () => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
};

const press = (element: ReactTestInstance) => {
  fireEvent.press(element);
  flushListTimers();
};

const renderGrid = (onSelectPersonality = jest.fn<void, [string]>()) => {
  const result = renderWithProviders(
    <PersonalityOptionGrid
      personalities={UNIVERSAL_PERSONALITIES}
      selectedPersonalityId="default"
      onSelectPersonality={onSelectPersonality}
      testID="grid"
    />
  );
  flushListTimers();
  return { onSelectPersonality, ...result };
};

describe('PersonalityOptionGrid', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    flushListTimers();
    jest.useRealTimers();
  });

  it('selects a personality when its card is tapped', () => {
    const { getByTestId, onSelectPersonality } = renderGrid();

    press(getByTestId('grid-option-bestie'));

    expect(onSelectPersonality).toHaveBeenCalledWith('bestie');
  });

  it('toggles details from View details without selecting the personality', () => {
    const { getByTestId, getByText, onSelectPersonality } = renderGrid();

    press(getByTestId('grid-details-bestie'));

    expect(getByText('Hide details ▲')).toBeTruthy(); // only the opened card flips
    expect(onSelectPersonality).not.toHaveBeenCalled();

    press(getByTestId('grid-details-bestie'));
    expect(onSelectPersonality).not.toHaveBeenCalled();
  });

  it('has no details toggle on the default personality', () => {
    const { queryByTestId } = renderGrid();

    expect(queryByTestId('grid-details-default')).toBeNull();
  });
});
