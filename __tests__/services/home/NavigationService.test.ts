import { NavigationService } from '@/services/home/NavigationService';
import { HOME_CONSTANTS } from '@/config/homeConstants';

describe('NavigationService', () => {
  const validSession = `${HOME_CONSTANTS.SESSION_ID_PREFIX}12345`;

  it('prepares chat navigation parameters and validates session IDs', () => {
    const params = NavigationService.prepareChatNavigation(validSession, { autoSend: true });
    expect(params).toEqual({ sessionId: validSession, autoSend: true });

    expect(() => NavigationService.prepareChatNavigation('', {})).toThrow('Session ID must be a non-empty string');
    expect(() => NavigationService.prepareChatNavigation('invalid', {})).toThrow('Session ID must start');
  });

  it('prepares quick start navigation with validation', () => {
    const params = NavigationService.prepareQuickStartNavigation(validSession, 'User prompt', 'Enriched prompt');
    expect(params).toEqual({
      sessionId: validSession,
      initialPrompt: 'Enriched prompt',
      userPrompt: 'User prompt',
      autoSend: true,
    });

    expect(() => NavigationService.prepareQuickStartNavigation(validSession, '', 'x')).toThrow('User prompt');
    expect(() => NavigationService.prepareQuickStartNavigation(validSession, 'x', '')).toThrow('Enriched prompt');
  });

  it('exposes screen name helpers and navigation validation', () => {
    expect(NavigationService.getChatScreenName()).toBe(HOME_CONSTANTS.SCREENS.CHAT);
    expect(NavigationService.getAPIConfigScreenName()).toBe(HOME_CONSTANTS.SCREENS.API_CONFIG);

    expect(NavigationService.validateNavigation(HOME_CONSTANTS.SCREENS.CHAT, { sessionId: validSession })).toBe(true);
    expect(NavigationService.validateNavigation(HOME_CONSTANTS.SCREENS.CHAT, { sessionId: 'invalid' })).toBe(false);
    expect(NavigationService.validateNavigation(HOME_CONSTANTS.SCREENS.API_CONFIG)).toBe(true);
    expect(NavigationService.validateNavigation('Unknown' as string)).toBe(false);
  });

  it('creates navigation handlers for chat and API configuration screens', () => {
    const navigate = jest.fn();
    const chatHandler = NavigationService.createChatNavigationHandler({ navigate });
    chatHandler(validSession, { userPrompt: 'hello' });

    expect(navigate).toHaveBeenCalledWith(
      HOME_CONSTANTS.SCREENS.CHAT,
      expect.objectContaining({ sessionId: validSession, userPrompt: 'hello' })
    );

    const apiHandler = NavigationService.createAPIConfigNavigationHandler({ navigate });
    apiHandler();
    expect(navigate).toHaveBeenCalledWith(HOME_CONSTANTS.SCREENS.API_CONFIG);
  });

  it('builds navigation params and removes undefined values', () => {
    const params = NavigationService.buildNavigationParams({ sessionId: validSession }, { autoSend: undefined, extra: 'value' });
    expect(params).toEqual({ sessionId: validSession, extra: 'value' });
  });
});
