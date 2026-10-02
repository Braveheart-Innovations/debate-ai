import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateVoicePicker } from '@/components/organisms/debate/DebateVoicePicker';
import type { AIConfig } from '@/types';
import type { DebateRecentVoiceSelection } from '@/services/debate/DebateVoiceRecentService';
import type {
  ElevenLabsVoiceListQuery,
  MediaProviderOptionsResponse,
  MediaProviderVoiceOption,
} from '@/types/media';

const mockRecentList = jest.fn();
const mockRecentRecord = jest.fn();
const mockFavList = jest.fn();
const mockFavListIds = jest.fn();
const mockFavAdd = jest.fn();
const mockFavRemove = jest.fn();

jest.mock('@/services/debate/DebateVoiceRecentService', () => ({
  DebateVoiceRecentService: {
    list: (...args: unknown[]) => mockRecentList(...args),
    record: (...args: unknown[]) => mockRecentRecord(...args),
    toVoiceOption: (recent: DebateRecentVoiceSelection): MediaProviderVoiceOption => ({
      id: recent.voiceId,
      name: recent.voiceName,
      voice_id: recent.voiceId,
      category: recent.category,
      labels: recent.labels,
      previewUrl: recent.previewUrl || null,
      preview_url: recent.previewUrl || null,
    }),
  },
}));

jest.mock('@/services/debate/DebateVoiceFavoriteService', () => ({
  DebateVoiceFavoriteService: {
    list: (...args: unknown[]) => mockFavList(...args),
    listIds: (...args: unknown[]) => mockFavListIds(...args),
    add: (...args: unknown[]) => mockFavAdd(...args),
    remove: (...args: unknown[]) => mockFavRemove(...args),
  },
}));

const singlePage = (voices: MediaProviderVoiceOption[], totalCount?: number): MediaProviderOptionsResponse => ({
  success: true,
  providerId: 'elevenlabs',
  voices,
  voiceHasMore: false,
  voiceNextPageToken: null,
  voiceTotalCount: totalCount ?? voices.length,
});

describe('DebateVoicePicker', () => {
  const debater: AIConfig = { id: 'debater-1', provider: 'claude', name: 'Claude', model: 'claude-opus-4-5' };

  const defaultVoices: MediaProviderVoiceOption[] = [
    {
      id: 'voice-host',
      name: 'Studio Host',
      voice_id: 'voice-host',
      category: 'premade',
      labels: { use_case: 'news', accent: 'American', gender: 'female' },
      previewUrl: 'https://example.com/host.mp3',
      sourceVoiceType: 'default',
    },
    {
      id: 'voice-debater',
      name: 'Roundtable Debater',
      voice_id: 'voice-debater',
      category: 'premade',
      labels: { use_case: 'conversational', accent: 'British', gender: 'male' },
      sourceVoiceType: 'default',
    },
  ];

  const flush = async (ms = 400) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockRecentList.mockResolvedValue([
      { voiceId: 'recent-voice', voiceName: 'Recent Voice', category: 'cloned', labels: { accent: 'Australian' }, lastUsedAt: 100, useCount: 2 },
    ]);
    mockRecentRecord.mockResolvedValue(undefined);
    mockFavList.mockResolvedValue([]);
    mockFavListIds.mockResolvedValue([]);
    mockFavAdd.mockResolvedValue(undefined);
    mockFavRemove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });

  it('lands on Default, switches to My Voices, filters by category, and records a selection', async () => {
    const onLoadVoices = jest.fn(async (query: ElevenLabsVoiceListQuery): Promise<MediaProviderOptionsResponse> => {
      if (query.voiceType === 'personal') {
        return singlePage([
          { id: 'voice-mine', name: 'My Clone', voice_id: 'voice-mine', category: 'cloned', labels: { gender: 'male' }, sourceVoiceType: 'personal' },
        ]);
      }
      return singlePage(defaultVoices, 2);
    });
    const onVoiceSelect = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getByText, getAllByText } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={onClose} onLoadVoices={onLoadVoices} onVoiceSelect={onVoiceSelect} />
    );
    await flush(0);

    // No favorites -> lands on Default.
    await waitFor(() => {
      expect(onLoadVoices).toHaveBeenCalledWith(expect.objectContaining({ voiceType: 'default' }));
    });
    expect(getAllByText('Studio Host').length).toBeGreaterThan(0);
    expect(getByText('Recent')).toBeTruthy();

    // Category lives in the filter sheet.
    fireEvent.press(getByTestId('debate-voice-filters-toggle'));
    fireEvent.press(getByText('Premade'));
    await flush(0);
    await waitFor(() => {
      expect(onLoadVoices).toHaveBeenCalledWith(expect.objectContaining({ category: 'premade' }));
    });
    fireEvent.press(getByText('Done'));

    fireEvent.press(getAllByText('My Voices')[0]);
    await flush(0);
    await waitFor(() => {
      expect(onLoadVoices).toHaveBeenCalledWith(expect.objectContaining({ voiceType: 'personal' }));
    });
    expect(getByText('My Clone')).toBeTruthy();

    fireEvent.press(getByTestId('debate-voice-option-voice-mine'));
    await flush(0);
    expect(onVoiceSelect).toHaveBeenCalledWith('debater-1', expect.objectContaining({ id: 'voice-mine' }));
    expect(mockRecentRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'voice-mine' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('auto-paginates a network source until exhausted', async () => {
    const onLoadVoices = jest.fn(async (query: ElevenLabsVoiceListQuery): Promise<MediaProviderOptionsResponse> => {
      if (query.voiceType === 'personal' && query.nextPageToken === 'page-2') {
        return { success: true, providerId: 'elevenlabs', voices: [{ id: 'voice-extra', name: 'Extra Voice', voice_id: 'voice-extra', sourceVoiceType: 'personal' }], voiceHasMore: false, voiceNextPageToken: null, voiceTotalCount: 2 };
      }
      if (query.voiceType === 'personal') {
        return { success: true, providerId: 'elevenlabs', voices: [{ id: 'voice-mine', name: 'My Clone', voice_id: 'voice-mine', sourceVoiceType: 'personal' }], voiceHasMore: true, voiceNextPageToken: 'page-2', voiceTotalCount: 2 };
      }
      return singlePage(defaultVoices, 2);
    });

    const { getByText, getAllByText } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={jest.fn()} onLoadVoices={onLoadVoices} onVoiceSelect={jest.fn()} />
    );
    await flush(0);

    fireEvent.press(getAllByText('My Voices')[0]);
    await flush(0);
    await waitFor(() => {
      expect(onLoadVoices).toHaveBeenCalledWith(expect.objectContaining({ voiceType: 'personal', nextPageToken: 'page-2' }));
    });
    await waitFor(() => { expect(getAllByText('Extra Voice').length).toBeGreaterThan(0); });
    expect(getByText('Showing all loaded voices')).toBeTruthy();
  });

  it('grays out previews without audio and enables a verified-language fallback', async () => {
    const onLoadVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => singlePage([
      { id: 'voice-silent', name: 'Silent Voice', voice_id: 'voice-silent', category: 'premade', sourceVoiceType: 'default' },
      { id: 'voice-lang', name: 'Multilingual Voice', voice_id: 'voice-lang', category: 'premade', sourceVoiceType: 'default', verified_languages: [{ language: 'English', locale: 'en-US', preview_url: 'https://example.com/lang.mp3' }] },
    ]));

    const { getByTestId } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={jest.fn()} onLoadVoices={onLoadVoices} onVoiceSelect={jest.fn()} />
    );
    await flush(0);

    await waitFor(() => { expect(getByTestId('debate-voice-preview-voice-silent')).toBeTruthy(); });
    expect(getByTestId('debate-voice-preview-voice-silent').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('debate-voice-preview-voice-lang').props.accessibilityState.disabled).toBe(false);
  });

  it('shows tone chips and a Newest sort in the filter sheet', async () => {
    const onLoadVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => singlePage([
      { id: 'voice-calm', name: 'Calm Narrator', voice_id: 'voice-calm', category: 'premade', labels: { descriptive: 'Calm', gender: 'female' }, sourceVoiceType: 'default' },
    ]));

    const { getByTestId, getByText, getAllByText } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={jest.fn()} onLoadVoices={onLoadVoices} onVoiceSelect={jest.fn()} />
    );
    await flush(0);

    await waitFor(() => { expect(getAllByText('Calm Narrator').length).toBeGreaterThan(0); });
    expect(getAllByText('Calm').length).toBeGreaterThan(0);

    fireEvent.press(getByTestId('debate-voice-filters-toggle'));
    fireEvent.press(getByText('Newest'));
    await flush(0);
    await waitFor(() => {
      expect(onLoadVoices).toHaveBeenCalledWith(expect.objectContaining({ sort: 'created_at_unix', sortDirection: 'desc' }));
    });
  });

  it('favorites a voice from the star control', async () => {
    const onLoadVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => singlePage(defaultVoices, 2));

    const { getByTestId } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={jest.fn()} onLoadVoices={onLoadVoices} onVoiceSelect={jest.fn()} />
    );
    await flush(0);

    await waitFor(() => { expect(getByTestId('debate-voice-favorite-voice-host')).toBeTruthy(); });
    expect(getByTestId('debate-voice-favorite-voice-host').props.accessibilityState.selected).toBe(false);

    fireEvent.press(getByTestId('debate-voice-favorite-voice-host'));
    await flush(0);
    expect(mockFavAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'voice-host' }));
  });

  it('shows persisted favorites on first open before loading default voices', async () => {
    const favoriteVoice: MediaProviderVoiceOption = {
      id: 'favorite-voice',
      name: 'Saved Favorite',
      voice_id: 'favorite-voice',
      category: 'cloned',
      sourceVoiceType: 'personal',
    };
    mockFavList.mockResolvedValue([favoriteVoice]);
    mockFavListIds.mockResolvedValue(['favorite-voice']);
    const onLoadVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => singlePage(defaultVoices, 2));

    const { getByText, queryByText } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={jest.fn()} onLoadVoices={onLoadVoices} onVoiceSelect={jest.fn()} />
    );
    await flush(0);

    await waitFor(() => { expect(getByText('Saved Favorite')).toBeTruthy(); });
    expect(queryByText('Studio Host')).toBeNull();
    expect(onLoadVoices).not.toHaveBeenCalled();
  });

  it('browses the community library and adds + favorites a voice on select', async () => {
    const onLoadVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => singlePage(defaultVoices, 2));
    const communityVoice: MediaProviderVoiceOption = {
      id: 'shared-voice', name: 'Community Star', voice_id: 'shared-voice', category: 'high_quality',
      labels: { gender: 'female', accent: 'British' }, previewUrl: 'https://example.com/shared.mp3',
      sourceVoiceType: 'community', isCommunity: true, publicOwnerId: 'owner-123', freeUsersAllowed: true,
    };
    const onLoadSharedVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => ({
      success: true, providerId: 'elevenlabs', voices: [communityVoice], voiceHasMore: false, voiceNextPageToken: null, voiceTotalCount: 1,
    }));
    const addedVoice: MediaProviderVoiceOption = { ...communityVoice, id: 'added-voice', voice_id: 'added-voice', isCommunity: false, isAddedByUser: true };
    const onAddSharedVoice = jest.fn(async () => addedVoice);
    const onVoiceSelect = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getAllByText } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={onClose} onLoadVoices={onLoadVoices} onLoadSharedVoices={onLoadSharedVoices} onAddSharedVoice={onAddSharedVoice} onVoiceSelect={onVoiceSelect} />
    );
    await flush(0);

    fireEvent.press(getAllByText('Explore')[0]);
    await flush(0);
    await waitFor(() => { expect(onLoadSharedVoices).toHaveBeenCalled(); });
    expect(getAllByText('Community Star').length).toBeGreaterThan(0);

    fireEvent.press(getByTestId('debate-voice-option-shared-voice'));
    await flush(0);
    await waitFor(() => { expect(onAddSharedVoice).toHaveBeenCalledWith(expect.objectContaining({ id: 'shared-voice' })); });
    await waitFor(() => { expect(onVoiceSelect).toHaveBeenCalledWith('debater-1', expect.objectContaining({ id: 'added-voice' })); });
    expect(mockFavAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'added-voice' }), ['shared-voice']);
    expect(onClose).toHaveBeenCalled();
  });

  it('sends server-side community filters when chosen in the filter sheet', async () => {
    const onLoadVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => singlePage(defaultVoices, 2));
    const onLoadSharedVoices = jest.fn(async (): Promise<MediaProviderOptionsResponse> => ({
      success: true, providerId: 'elevenlabs', voices: [], voiceHasMore: false, voiceNextPageToken: null, voiceTotalCount: 0,
    }));

    const { getByTestId, getByText, getAllByText } = renderWithProviders(
      <DebateVoicePicker visible target={{ kind: 'debater', ai: debater }} voiceSelections={{}} onClose={jest.fn()} onLoadVoices={onLoadVoices} onLoadSharedVoices={onLoadSharedVoices} onAddSharedVoice={jest.fn()} onVoiceSelect={jest.fn()} />
    );
    await flush(0);

    fireEvent.press(getAllByText('Explore')[0]);
    await flush(0);
    await waitFor(() => expect(onLoadSharedVoices).toHaveBeenCalled());

    fireEvent.press(getByTestId('debate-voice-filters-toggle'));
    fireEvent.press(getByText('British'));
    fireEvent.press(getByText('Narration'));
    await flush(0);
    await waitFor(() => {
      expect(onLoadSharedVoices).toHaveBeenCalledWith(expect.objectContaining({
        accent: 'british',
        useCases: expect.arrayContaining(['narrative_story']),
      }));
    });
  });
});
