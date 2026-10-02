import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import {
  DebateSessionHeader,
  type DebateSessionHeaderTeam,
} from '@/components/organisms/debate/DebateSessionHeader';
import { getPresetForFormat } from '@/config/debate/formats';

const teams: DebateSessionHeaderTeam[] = [
  {
    side: 'aff',
    label: 'Affirmative',
    participants: [
      { id: 'gemini', name: 'Gemini', personaLabel: 'Clear, Engaging Educator With Extra Long Style Name', personaIcon: '🎓' },
      { id: 'claude', name: 'Claude' },
    ],
  },
  {
    side: 'neg',
    label: 'Negative',
    participants: [
      { id: 'mistral', name: 'Mistral', personaLabel: 'Crossfire Analyst', personaIcon: '🎯' },
      { id: 'chatgpt', name: 'ChatGPT', personaLabel: 'Socratic Coach', personaIcon: '💬' },
    ],
  },
];

describe('DebateSessionHeader', () => {
  it('renders a dense 2v2 debate setup without collapsing motion, team, or turn details', () => {
    const preset = getPresetForFormat('oxford', 'standard');
    const motion = 'Nuclear energy is the best climate solution when measured against urgency, reliability, and total grid emissions.';

    const { getByText, getAllByText, getByTestId, queryByText } = renderWithProviders(
      <DebateSessionHeader
        topic={`Motion: ${motion}`}
        teams={teams}
        presetLabel="Oxford · 2v2"
        currentMessageIndex={2}
        totalMessages={preset.messages.length}
        currentTurnLabel="Second Affirmative First Argument"
        activeSideLabel="Affirmative"
        timelineMessages={preset.messages}
        onBack={jest.fn()}
        rightElement={<Text testID="header-actions">actions</Text>}
      />
    );

    expect(getByTestId('debate-session-header')).toBeTruthy();
    expect(getByText(motion).props.numberOfLines).toBe(2);
    expect(getAllByText('3/6').length).toBeGreaterThan(0);
    expect(getByText('Oxford · 2v2')).toBeTruthy();
    expect(getAllByText('Second Affirmative First Argument').length).toBeGreaterThan(0);
    expect(getAllByText('Affirmative').length).toBeGreaterThan(1);
    expect(getByText('Gemini')).toBeTruthy();
    expect(getByText('🎓')).toBeTruthy();
    expect(queryByText('Clear, Engaging Educator With Extra Long Style Name')).toBeNull();
    expect(queryByText('Speech Order')).toBeNull();
    expect(getAllByText('Negative').length).toBeGreaterThan(0);
  });

  it('keeps the back action available in the custom debate header', () => {
    const onBack = jest.fn();
    const preset = getPresetForFormat('oxford', 'short');
    const { getByTestId } = renderWithProviders(
      <DebateSessionHeader
        topic="Homework should be abolished."
        teams={teams}
        presetLabel="Oxford · 1v1"
        currentMessageIndex={0}
        totalMessages={preset.messages.length}
        activeSideLabel="Affirmative"
        timelineMessages={preset.messages}
        onBack={onBack}
      />
    );

    fireEvent.press(getByTestId('debate-session-header-back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
