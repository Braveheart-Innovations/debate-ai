import { UserFriendlyMessages, getUserFriendlyMessage } from '@/errors/messages/UserFriendlyMessages';
import { ErrorCode } from '@/errors/codes/ErrorCodes';

describe('UserFriendlyMessages', () => {
  describe('Network Error Messages', () => {
    it('has message for NETWORK_OFFLINE', () => {
      expect(UserFriendlyMessages[ErrorCode.NETWORK_OFFLINE]).toBe(
        'You appear to be offline. Please check your internet connection.'
      );
    });

    it('has message for NETWORK_TIMEOUT', () => {
      expect(UserFriendlyMessages[ErrorCode.NETWORK_TIMEOUT]).toBe(
        'The request took too long. Please try again.'
      );
    });

    it('has message for NETWORK_DNS_FAILURE', () => {
      expect(UserFriendlyMessages[ErrorCode.NETWORK_DNS_FAILURE]).toBe(
        'Unable to reach the server. Please check your connection.'
      );
    });
  });

  describe('API Error Messages', () => {
    it('has message for API_RATE_LIMITED', () => {
      expect(UserFriendlyMessages[ErrorCode.API_RATE_LIMITED]).toBe(
        "You've made too many requests. Please wait a moment and try again."
      );
    });

    it('has message for API_UNAUTHORIZED', () => {
      expect(UserFriendlyMessages[ErrorCode.API_UNAUTHORIZED]).toBe(
        'Your API key is invalid or expired. Please check your settings.'
      );
    });

    it('has message for API_STREAMING_FAILED', () => {
      expect(UserFriendlyMessages[ErrorCode.API_STREAMING_FAILED]).toBe(
        'Streaming was interrupted. Switching to standard mode.'
      );
    });
  });

  describe('Validation Error Messages', () => {
    it('has message for VALIDATION_REQUIRED', () => {
      expect(UserFriendlyMessages[ErrorCode.VALIDATION_REQUIRED]).toBe(
        'This field is required.'
      );
    });

    it('has message for VALIDATION_TOPIC_REQUIRED', () => {
      expect(UserFriendlyMessages[ErrorCode.VALIDATION_TOPIC_REQUIRED]).toBe(
        'Please enter a topic to continue.'
      );
    });

    it('has message for VALIDATION_AI_SELECTION_REQUIRED', () => {
      expect(UserFriendlyMessages[ErrorCode.VALIDATION_AI_SELECTION_REQUIRED]).toBe(
        'Please select at least one AI to continue.'
      );
    });

    it('has message for VALIDATION_IMAGE_REQUIRED', () => {
      expect(UserFriendlyMessages[ErrorCode.VALIDATION_IMAGE_REQUIRED]).toBe(
        'Please select or generate an image first.'
      );
    });
  });

  describe('App Error Messages', () => {
    it('has message for APP_STORAGE_FULL', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_STORAGE_FULL]).toBe(
        'Storage is full. Please free up some space.'
      );
    });

    it('has message for APP_PERMISSIONS_DENIED', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_PERMISSIONS_DENIED]).toBe(
        'Required permissions were denied. Please enable them in settings.'
      );
    });

    it('has message for APP_PREMIUM_REQUIRED', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_PREMIUM_REQUIRED]).toBe(
        'This feature requires a premium subscription.'
      );
    });

    it('has message for APP_SHARING_UNAVAILABLE', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_SHARING_UNAVAILABLE]).toBe(
        'Sharing is not available on this device.'
      );
    });

    it('has message for APP_IMAGE_SAVE_FAILED', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_IMAGE_SAVE_FAILED]).toBe(
        'Failed to save image. Please try again.'
      );
    });

    it('has message for APP_PDF_GENERATION_FAILED', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_PDF_GENERATION_FAILED]).toBe(
        'Failed to generate PDF. Please try again.'
      );
    });

    it('has message for APP_DEMO_MODE_RESTRICTED', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_DEMO_MODE_RESTRICTED]).toBe(
        'This feature is limited in demo mode. Add your API key to unlock.'
      );
    });

    it('has message for APP_CAMERA_PERMISSION_DENIED', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_CAMERA_PERMISSION_DENIED]).toBe(
        'Camera access denied. Please enable it in Settings.'
      );
    });

    it('has message for APP_PHOTO_LIBRARY_PERMISSION_DENIED', () => {
      expect(UserFriendlyMessages[ErrorCode.APP_PHOTO_LIBRARY_PERMISSION_DENIED]).toBe(
        'Photo library access denied. Please enable it in Settings.'
      );
    });
  });

  describe('Purchase Error Messages', () => {
    it('has message for PURCHASE_FAILED', () => {
      expect(UserFriendlyMessages[ErrorCode.PURCHASE_FAILED]).toBe(
        'Purchase failed. Please try again.'
      );
    });

    it('has message for PURCHASE_CANCELLED', () => {
      expect(UserFriendlyMessages[ErrorCode.PURCHASE_CANCELLED]).toBe(
        'Purchase was cancelled.'
      );
    });

    it('has message for PURCHASE_RESTORE_FAILED', () => {
      expect(UserFriendlyMessages[ErrorCode.PURCHASE_RESTORE_FAILED]).toBe(
        'Failed to restore purchases. Please try again.'
      );
    });

    it('has message for PURCHASE_NO_PURCHASES_FOUND', () => {
      expect(UserFriendlyMessages[ErrorCode.PURCHASE_NO_PURCHASES_FOUND]).toBe(
        'No previous purchases found to restore.'
      );
    });

    it('has message for PURCHASE_PRODUCT_UNAVAILABLE', () => {
      expect(UserFriendlyMessages[ErrorCode.PURCHASE_PRODUCT_UNAVAILABLE]).toBe(
        'This product is currently unavailable.'
      );
    });

    it('has message for PURCHASE_NETWORK_ERROR', () => {
      expect(UserFriendlyMessages[ErrorCode.PURCHASE_NETWORK_ERROR]).toBe(
        'Network error during purchase. Please check your connection.'
      );
    });
  });

  describe('Unknown Error Messages', () => {
    it('has message for UNKNOWN', () => {
      expect(UserFriendlyMessages[ErrorCode.UNKNOWN]).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });
  });

  describe('Message Coverage', () => {
    it('has messages for all error codes', () => {
      Object.values(ErrorCode).forEach(code => {
        expect(UserFriendlyMessages[code]).toBeDefined();
        expect(typeof UserFriendlyMessages[code]).toBe('string');
        expect(UserFriendlyMessages[code].length).toBeGreaterThan(0);
      });
    });

    it('all messages are user-friendly (not technical)', () => {
      Object.values(UserFriendlyMessages).forEach(message => {
        // Messages should not contain technical terms
        expect(message.toLowerCase()).not.toContain('exception');
        expect(message.toLowerCase()).not.toContain('null');
        expect(message.toLowerCase()).not.toContain('undefined');
        expect(message.toLowerCase()).not.toContain('stack trace');
      });
    });
  });
});

describe('getUserFriendlyMessage', () => {
  it('returns correct message for known error code', () => {
    const message = getUserFriendlyMessage(ErrorCode.NETWORK_OFFLINE);
    expect(message).toBe('You appear to be offline. Please check your internet connection.');
  });

  it('returns correct message for purchase error', () => {
    const message = getUserFriendlyMessage(ErrorCode.PURCHASE_FAILED);
    expect(message).toBe('Purchase failed. Please try again.');
  });

  it('returns correct message for validation error', () => {
    const message = getUserFriendlyMessage(ErrorCode.VALIDATION_TOPIC_REQUIRED);
    expect(message).toBe('Please enter a topic to continue.');
  });

  it('returns unknown message for invalid code', () => {
    const message = getUserFriendlyMessage('INVALID_CODE' as ErrorCode);
    expect(message).toBe('An unexpected error occurred. Please try again.');
  });

  it('returns unknown message for undefined code', () => {
    const message = getUserFriendlyMessage(undefined as unknown as ErrorCode);
    expect(message).toBe('An unexpected error occurred. Please try again.');
  });
});
