import { extractSSEErrorMessage, mapErrorTypeToMessage } from '../extractSSEErrorMessage';

describe('extractSSEErrorMessage', () => {
  describe('data property extraction', () => {
    it('extracts message from OpenAI-style nested error', () => {
      const error = {
        data: JSON.stringify({
          error: {
            message: 'Authentication Fails, Your api key is invalid',
            type: 'authentication_error',
          },
        }),
      };

      expect(extractSSEErrorMessage(error)).toBe(
        'Authentication Fails, Your api key is invalid'
      );
    });

    it('extracts message from simple JSON with message property', () => {
      const error = {
        data: JSON.stringify({ message: 'Something went wrong' }),
      };

      expect(extractSSEErrorMessage(error)).toBe('Something went wrong');
    });

    it('extracts message from direct error string in JSON', () => {
      const error = {
        data: JSON.stringify({ error: 'Bad request' }),
      };

      expect(extractSSEErrorMessage(error)).toBe('Bad request');
    });

    it('uses raw data string when not valid JSON', () => {
      const error = {
        data: 'Plain text error',
      };

      expect(extractSSEErrorMessage(error)).toBe('Plain text error');
    });

    it('returns default when data is unparseable JSON object', () => {
      const error = {
        data: '{invalid json',
      };

      expect(extractSSEErrorMessage(error, 'Default message')).toBe('Default message');
    });

    it('returns default when data is HTML error page', () => {
      const error = {
        data: '<html><body>502 Bad Gateway</body></html>',
      };

      expect(extractSSEErrorMessage(error, 'Connection failed')).toBe('Connection failed');
    });

    it('returns default when data is very long string', () => {
      const error = {
        data: 'A'.repeat(300),
      };

      expect(extractSSEErrorMessage(error, 'Connection failed')).toBe('Connection failed');
    });
  });

  describe('message property extraction', () => {
    it('extracts from string message property', () => {
      const error = {
        message: 'Direct error message',
      };

      expect(extractSSEErrorMessage(error)).toBe('Direct error message');
    });

    it('parses JSON from message property', () => {
      const error = {
        message: JSON.stringify({
          error: { message: 'Nested in message prop' },
        }),
      };

      expect(extractSSEErrorMessage(error)).toBe('Nested in message prop');
    });

    it('handles object message property', () => {
      const error = {
        message: {
          error: { message: 'From message object' },
        },
      };

      expect(extractSSEErrorMessage(error)).toBe('From message object');
    });
  });

  describe('error property extraction', () => {
    it('extracts from string error property', () => {
      const error = {
        error: 'Direct error string',
      };

      expect(extractSSEErrorMessage(error)).toBe('Direct error string');
    });

    it('extracts from object error property', () => {
      const error = {
        error: { message: 'From error object' },
      };

      expect(extractSSEErrorMessage(error)).toBe('From error object');
    });
  });

  describe('HTTP status code handling', () => {
    it('keeps message with "unauthorized" for 401 status', () => {
      const error = {
        status: 401,
        data: JSON.stringify({ message: 'Unauthorized' }),
      };

      // Message contains "unauthorized", so it's kept
      expect(extractSSEErrorMessage(error)).toBe('Unauthorized');
    });

    it('returns generic auth message for 401 without auth keywords', () => {
      const error = {
        status: 401,
        data: JSON.stringify({ message: 'Access denied' }),
      };

      // Message doesn't contain auth keywords, so generic message is used
      expect(extractSSEErrorMessage(error)).toBe('Invalid API key or unauthorized access');
    });

    it('keeps original auth message if it mentions API key', () => {
      const error = {
        status: 401,
        data: JSON.stringify({ error: { message: 'Invalid API key provided' } }),
      };

      expect(extractSSEErrorMessage(error)).toBe('Invalid API key provided');
    });

    it('returns generic rate limit message for 429 without rate/limit keywords', () => {
      const error = {
        status: 429,
        message: 'Too many requests',
      };

      // "Too many requests" doesn't contain "rate" or "limit", so generic message is used
      expect(extractSSEErrorMessage(error)).toBe('Rate limit exceeded. Please try again later');
    });

    it('keeps message with rate keyword for 429 status', () => {
      const error = {
        status: 429,
        message: 'Rate limit exceeded',
      };

      // Message contains "rate", so it's kept
      expect(extractSSEErrorMessage(error)).toBe('Rate limit exceeded');
    });


    it('returns unavailable message for 503 status', () => {
      const error = {
        status: 503,
        message: 'Error',
      };

      expect(extractSSEErrorMessage(error)).toBe(
        'The AI service is temporarily unavailable. Please try again'
      );
    });

    it('returns unavailable message for 529 status (Claude overload)', () => {
      const error = {
        status: 529,
        message: 'Overloaded',
      };

      // Message mentions overload, so it's kept
      expect(extractSSEErrorMessage(error)).toBe('Overloaded');
    });
  });

  describe('edge cases', () => {
    it('returns default for null', () => {
      expect(extractSSEErrorMessage(null)).toBe('Connection failed');
    });

    it('returns default for undefined', () => {
      expect(extractSSEErrorMessage(undefined)).toBe('Connection failed');
    });

    it('returns default for empty object', () => {
      expect(extractSSEErrorMessage({})).toBe('Connection failed');
    });

    it('returns default for non-object', () => {
      expect(extractSSEErrorMessage('string error')).toBe('Connection failed');
    });

    it('uses custom default message', () => {
      expect(extractSSEErrorMessage(null, 'Custom default')).toBe('Custom default');
    });

    it('handles [object Object] scenario - empty data', () => {
      // This was the original bug - String({}) gives "[object Object]"
      const error = {
        data: '',
        message: '',
      };

      expect(extractSSEErrorMessage(error, 'Fallback')).toBe('Fallback');
    });
  });
});

describe('mapErrorTypeToMessage', () => {
  it('maps overloaded_error to friendly message', () => {
    expect(mapErrorTypeToMessage('overloaded_error')).toBe(
      'The AI service is temporarily overloaded. Please try again'
    );
  });

  it('maps rate_limit_error to friendly message', () => {
    expect(mapErrorTypeToMessage('rate_limit_error')).toBe(
      'Rate limit exceeded. Please wait a moment before trying again'
    );
  });

  it('maps authentication_error to friendly message', () => {
    expect(mapErrorTypeToMessage('authentication_error')).toBe(
      'Authentication failed. Please check your API key'
    );
  });

  it('maps invalid_api_key to friendly message', () => {
    expect(mapErrorTypeToMessage('invalid_api_key')).toBe(
      'Invalid API key. Please check your settings'
    );
  });

  it('maps invalid_request_error to friendly message', () => {
    expect(mapErrorTypeToMessage('invalid_request_error')).toBe(
      'Invalid request. Please try again'
    );
  });

  it('returns null for unknown error types', () => {
    expect(mapErrorTypeToMessage('unknown_type')).toBeNull();
  });
});
