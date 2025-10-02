jest.mock('@/utils/home/sessionIdGenerator', () => ({
  generateSimpleSessionId: jest.fn(() => 'session_mocked'),
}));

import { SessionService } from '@/services/home/SessionService';
import { generateSimpleSessionId } from '@/utils/home/sessionIdGenerator';

const baseAI = {
  id: 'claude',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-4',
  personality: 'default',
  avatar: 'icon',
  icon: 'icon',
  iconType: 'letter',
  color: '#fff',
};

describe('SessionService', () => {
  it('creates sessions with generated IDs and timestamps', () => {
    const session = SessionService.createSession([baseAI], { claude: 'default' });
    expect(session.sessionId).toBe('session_mocked');
    expect(session.selectedModels).toEqual({});
    expect(session.aiPersonalities).toEqual({ claude: 'default' });
    expect(new Date(session.createdAt).toString()).not.toBe('Invalid Date');
    expect(generateSimpleSessionId).toHaveBeenCalled();
  });

  it('validates session AI selections and throws on invalid input', () => {
    expect(() => SessionService.validateSessionAIs([])).toThrow('At least');
    expect(() => SessionService.validateSessionAIs([{ ...baseAI, name: '' }])).toThrow('missing required fields');

    expect(() => SessionService.validateSessionAIs([baseAI])).not.toThrow();
  });

  it('prepares session data for Redux dispatch', () => {
    const data = SessionService.prepareSessionData([baseAI], { claude: 'default' }, { claude: 'claude-5' });
    expect(data).toEqual({
      selectedAIs: [baseAI],
      aiPersonalities: { claude: 'default' },
      selectedModels: { claude: 'claude-5' },
    });
  });

  it('validates session configuration against personalities mapping', () => {
    expect(SessionService.validateSessionConfiguration([baseAI], { claude: 'default' })).toBe(true);
    expect(SessionService.validateSessionConfiguration([baseAI], { claude: '' })).toBe(false);
    expect(SessionService.validateSessionConfiguration([], {})).toBe(false);
  });

  it('calculates session limits based on availability', () => {
    expect(SessionService.calculateSessionLimits(5)).toBe(3);
    expect(SessionService.calculateSessionLimits(2)).toBe(2);
  });
});
