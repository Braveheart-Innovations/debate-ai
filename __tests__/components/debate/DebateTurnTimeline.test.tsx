import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import {
  DebateTurnTimeline,
  getDebateTimelineChipWidths,
  getDebateTimelineActiveIndex,
  getDebateTimelineLeftOffset,
} from '@/components/organisms/debate/DebateTurnTimeline';
import { getPresetForFormat } from '@/config/debate/formats';

describe('DebateTurnTimeline', () => {
  it('renders speech order, current index, and cross-examination role labels', () => {
    const preset = getPresetForFormat('lincoln_douglas', 'standard');
    const { getByText, getAllByText } = renderWithProviders(
      <DebateTurnTimeline
        messages={preset.messages}
        currentMessageIndex={2}
        currentTurnLabel="Cross-Examination (CX) · answering"
      />
    );

    expect(getByText('Speech Order')).toBeTruthy();
    expect(getAllByText(`3/${preset.messages.length}`).length).toBeGreaterThan(0);
    expect(getAllByText('Cross-Examination (CX) · answering').length).toBeGreaterThan(0);
    expect(getAllByText('Cross-Examination (CX)').length).toBeGreaterThan(0);
    expect(getAllByText('Affirmative · answers').length).toBeGreaterThan(0);
  });

  it('can hide the duplicated current-step summary when embedded in a richer header', () => {
    const preset = getPresetForFormat('oxford', 'short');
    const { queryByText, getByText } = renderWithProviders(
      <DebateTurnTimeline
        messages={preset.messages}
        currentMessageIndex={1}
        showCurrentSummary={false}
        showRailHeader={false}
        embedded
      />
    );

    expect(getByText('Negative Opening Statement')).toBeTruthy();
    expect(queryByText('Speech Order')).toBeNull();
    expect(queryByText('Current step')).toBeNull();
  });

  it('clamps active index and computes a left-locked rail offset', () => {
    const preset = getPresetForFormat('lincoln_douglas', 'standard');
    const embeddedWidths = getDebateTimelineChipWidths(362, true);

    expect(getDebateTimelineActiveIndex(-4, preset.messages.length)).toBe(0);
    expect(getDebateTimelineActiveIndex(99, preset.messages.length)).toBe(preset.messages.length - 1);
    expect(getDebateTimelineLeftOffset(0, 124)).toBe(0);
    expect(getDebateTimelineLeftOffset(2, 124)).toBe(264);
    expect(embeddedWidths.activeChipWidth).toBeGreaterThan(embeddedWidths.inactiveChipWidth);
  });
});
