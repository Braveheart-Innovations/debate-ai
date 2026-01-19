import { ErrorCode, ErrorSeverity } from '@/errors/codes/ErrorCodes';

describe('ErrorCode', () => {
  describe('Network Errors (E1xxx)', () => {
    it('has NETWORK_OFFLINE code', () => {
      expect(ErrorCode.NETWORK_OFFLINE).toBe('E1001');
    });

    it('has NETWORK_TIMEOUT code', () => {
      expect(ErrorCode.NETWORK_TIMEOUT).toBe('E1002');
    });

    it('has NETWORK_DNS_FAILURE code', () => {
      expect(ErrorCode.NETWORK_DNS_FAILURE).toBe('E1003');
    });

    it('has NETWORK_SSL_ERROR code', () => {
      expect(ErrorCode.NETWORK_SSL_ERROR).toBe('E1004');
    });

    it('has NETWORK_CONNECTION_REFUSED code', () => {
      expect(ErrorCode.NETWORK_CONNECTION_REFUSED).toBe('E1005');
    });
  });

  describe('API Errors (E2xxx)', () => {
    it('has API_UNAUTHORIZED code', () => {
      expect(ErrorCode.API_UNAUTHORIZED).toBe('E2001');
    });

    it('has API_RATE_LIMITED code', () => {
      expect(ErrorCode.API_RATE_LIMITED).toBe('E2004');
    });

    it('has API_STREAMING_FAILED code', () => {
      expect(ErrorCode.API_STREAMING_FAILED).toBe('E2008');
    });
  });

  describe('Authentication Errors (E3xxx)', () => {
    it('has AUTH_INVALID_CREDENTIALS code', () => {
      expect(ErrorCode.AUTH_INVALID_CREDENTIALS).toBe('E3001');
    });

    it('has AUTH_SESSION_EXPIRED code', () => {
      expect(ErrorCode.AUTH_SESSION_EXPIRED).toBe('E3002');
    });
  });

  describe('Validation Errors (E4xxx)', () => {
    it('has VALIDATION_REQUIRED code', () => {
      expect(ErrorCode.VALIDATION_REQUIRED).toBe('E4001');
    });

    it('has VALIDATION_INVALID_FORMAT code', () => {
      expect(ErrorCode.VALIDATION_INVALID_FORMAT).toBe('E4002');
    });

    it('has VALIDATION_API_KEY_INVALID code', () => {
      expect(ErrorCode.VALIDATION_API_KEY_INVALID).toBe('E4003');
    });

    it('has VALIDATION_TOPIC_REQUIRED code', () => {
      expect(ErrorCode.VALIDATION_TOPIC_REQUIRED).toBe('E4007');
    });

    it('has VALIDATION_AI_SELECTION_REQUIRED code', () => {
      expect(ErrorCode.VALIDATION_AI_SELECTION_REQUIRED).toBe('E4008');
    });

    it('has VALIDATION_IMAGE_REQUIRED code', () => {
      expect(ErrorCode.VALIDATION_IMAGE_REQUIRED).toBe('E4009');
    });
  });

  describe('App Errors (E5xxx)', () => {
    it('has APP_STORAGE_FULL code', () => {
      expect(ErrorCode.APP_STORAGE_FULL).toBe('E5001');
    });

    it('has APP_PERMISSIONS_DENIED code', () => {
      expect(ErrorCode.APP_PERMISSIONS_DENIED).toBe('E5002');
    });

    it('has APP_PREMIUM_REQUIRED code', () => {
      expect(ErrorCode.APP_PREMIUM_REQUIRED).toBe('E5004');
    });

    it('has APP_SHARING_UNAVAILABLE code', () => {
      expect(ErrorCode.APP_SHARING_UNAVAILABLE).toBe('E5008');
    });

    it('has APP_IMAGE_SAVE_FAILED code', () => {
      expect(ErrorCode.APP_IMAGE_SAVE_FAILED).toBe('E5009');
    });

    it('has APP_PDF_GENERATION_FAILED code', () => {
      expect(ErrorCode.APP_PDF_GENERATION_FAILED).toBe('E5010');
    });

    it('has APP_DEMO_MODE_RESTRICTED code', () => {
      expect(ErrorCode.APP_DEMO_MODE_RESTRICTED).toBe('E5011');
    });

    it('has APP_CAMERA_PERMISSION_DENIED code', () => {
      expect(ErrorCode.APP_CAMERA_PERMISSION_DENIED).toBe('E5013');
    });

    it('has APP_PHOTO_LIBRARY_PERMISSION_DENIED code', () => {
      expect(ErrorCode.APP_PHOTO_LIBRARY_PERMISSION_DENIED).toBe('E5014');
    });
  });

  describe('Purchase Errors (E6xxx)', () => {
    it('has PURCHASE_FAILED code', () => {
      expect(ErrorCode.PURCHASE_FAILED).toBe('E6001');
    });

    it('has PURCHASE_CANCELLED code', () => {
      expect(ErrorCode.PURCHASE_CANCELLED).toBe('E6002');
    });

    it('has PURCHASE_RESTORE_FAILED code', () => {
      expect(ErrorCode.PURCHASE_RESTORE_FAILED).toBe('E6003');
    });

    it('has PURCHASE_NO_PURCHASES_FOUND code', () => {
      expect(ErrorCode.PURCHASE_NO_PURCHASES_FOUND).toBe('E6004');
    });

    it('has PURCHASE_PRODUCT_UNAVAILABLE code', () => {
      expect(ErrorCode.PURCHASE_PRODUCT_UNAVAILABLE).toBe('E6005');
    });

    it('has PURCHASE_NETWORK_ERROR code', () => {
      expect(ErrorCode.PURCHASE_NETWORK_ERROR).toBe('E6006');
    });
  });

  describe('Unknown/System Errors (E9xxx)', () => {
    it('has UNKNOWN code', () => {
      expect(ErrorCode.UNKNOWN).toBe('E9999');
    });
  });

  describe('Error Code Format', () => {
    it('all error codes follow EXXXX format', () => {
      const errorCodePattern = /^E\d{4}$/;
      Object.values(ErrorCode).forEach(code => {
        expect(code).toMatch(errorCodePattern);
      });
    });

    it('network errors start with E1', () => {
      expect(ErrorCode.NETWORK_OFFLINE).toMatch(/^E1/);
      expect(ErrorCode.NETWORK_TIMEOUT).toMatch(/^E1/);
      expect(ErrorCode.NETWORK_DNS_FAILURE).toMatch(/^E1/);
    });

    it('API errors start with E2', () => {
      expect(ErrorCode.API_RATE_LIMITED).toMatch(/^E2/);
      expect(ErrorCode.API_UNAUTHORIZED).toMatch(/^E2/);
      expect(ErrorCode.API_STREAMING_FAILED).toMatch(/^E2/);
    });

    it('authentication errors start with E3', () => {
      expect(ErrorCode.AUTH_INVALID_CREDENTIALS).toMatch(/^E3/);
      expect(ErrorCode.AUTH_SESSION_EXPIRED).toMatch(/^E3/);
    });

    it('validation errors start with E4', () => {
      expect(ErrorCode.VALIDATION_REQUIRED).toMatch(/^E4/);
      expect(ErrorCode.VALIDATION_TOPIC_REQUIRED).toMatch(/^E4/);
    });

    it('app errors start with E5', () => {
      expect(ErrorCode.APP_STORAGE_FULL).toMatch(/^E5/);
      expect(ErrorCode.APP_SHARING_UNAVAILABLE).toMatch(/^E5/);
    });

    it('purchase errors start with E6', () => {
      expect(ErrorCode.PURCHASE_FAILED).toMatch(/^E6/);
      expect(ErrorCode.PURCHASE_CANCELLED).toMatch(/^E6/);
    });
  });
});

describe('ErrorSeverity', () => {
  it('includes success severity', () => {
    const severities: ErrorSeverity[] = ['success', 'info', 'warning', 'error', 'critical'];
    expect(severities).toContain('success');
  });

  it('includes info severity', () => {
    const severities: ErrorSeverity[] = ['success', 'info', 'warning', 'error', 'critical'];
    expect(severities).toContain('info');
  });

  it('includes warning severity', () => {
    const severities: ErrorSeverity[] = ['success', 'info', 'warning', 'error', 'critical'];
    expect(severities).toContain('warning');
  });

  it('includes error severity', () => {
    const severities: ErrorSeverity[] = ['success', 'info', 'warning', 'error', 'critical'];
    expect(severities).toContain('error');
  });

  it('includes critical severity', () => {
    const severities: ErrorSeverity[] = ['success', 'info', 'warning', 'error', 'critical'];
    expect(severities).toContain('critical');
  });
});
