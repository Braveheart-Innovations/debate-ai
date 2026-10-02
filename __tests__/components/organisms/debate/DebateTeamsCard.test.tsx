import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateTeamsCard, type DebateTeamSlotDescriptor } from '@/components/organisms/debate/DebateTeamsCard';
import type { AIConfig } from '@/types';

const claude: AIConfig = {
  id: 'claude-debater-slot-1',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-model',
  color: '#d97757',
};

const slots: DebateTeamSlotDescriptor[] = [
  {
    index: 0,
    label: 'Affirmative 1',
    side: 'affirmative',
    ai: claude,
    modelLabel: 'Claude Opus',
    personalityLabel: '🤖 Default',
    voiceLabel: '🔊 Voice One',
  },
  {
    index: 1,
    label: 'Negative 1',
    side: 'negative',
    ai: null,
  },
];

const baseProps = {
  slots,
  filledCount: 1,
  totalCount: 2,
  onSlotPress: jest.fn(),
  testID: 'teams-card',
};

describe('DebateTeamsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders both team columns with filled and empty slots', () => {
    const { getByText } = renderWithProviders(<DebateTeamsCard {...baseProps} />);

    expect(getByText('Affirmative')).toBeTruthy();
    expect(getByText('Negative')).toBeTruthy();
    expect(getByText('Claude')).toBeTruthy();
    expect(getByText(/Affirmative 1 · Claude Opus/)).toBeTruthy();
    expect(getByText(/🤖 Default · 🔊 Voice One/)).toBeTruthy();
    expect(getByText('Add debater')).toBeTruthy();
    expect(getByText('1/2')).toBeTruthy();
  });

  it('reports slot presses for filled and empty slots', () => {
    const { getByTestId } = renderWithProviders(<DebateTeamsCard {...baseProps} />);

    fireEvent.press(getByTestId('teams-card-slot-0'));
    expect(baseProps.onSlotPress).toHaveBeenCalledWith(slots[0]);

    fireEvent.press(getByTestId('teams-card-slot-1'));
    expect(baseProps.onSlotPress).toHaveBeenCalledWith(slots[1]);
  });

  it('flags a missing required voice', () => {
    const { getByText } = renderWithProviders(
      <DebateTeamsCard
        {...baseProps}
        slots={[{ ...slots[0], voiceLabel: undefined, voiceMissing: true }, slots[1]]}
      />
    );

    expect(getByText('Voice needed')).toBeTruthy();
  });

  it('renders the live search status note in the right tone', () => {
    const { getByText } = renderWithProviders(
      <DebateTeamsCard
        {...baseProps}
        statusNote={{ tone: 'enabled', text: 'Live Search enabled for this debate.' }}
      />
    );

    expect(getByText('Live Search enabled for this debate.')).toBeTruthy();
  });
});
