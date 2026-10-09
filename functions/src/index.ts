export { validatePurchase } from './validatePurchase';
export { handlePlayStoreNotification } from './notifications/playStore';
export { handleAppStoreNotification } from './notifications/appStore';
export { deleteAccount } from './deleteAccount';
export {
  checkLoginRateLimit,
  verifyEmailPasswordSignIn,
  clearLoginAttempts,
  checkPasswordResetRateLimit,
  requestPasswordResetEmail,
} from './authRateLimiting';

// API Key Management
export { saveApiKey, deleteApiKey, getConfiguredProviders } from './apiKeys';
export { testApiKey } from './testApiKey';

// Two-Factor Backup Codes
export { generateBackupCodes, getBackupCodesStatus } from './backupCodes';
export { redeemBackupCode } from './redeemBackupCode';

// Data Connector Key Management
export { saveDataServiceKey, deleteDataServiceKey, getConfiguredDataServices } from './dataConnectors';

// AI Proxy
export { proxyAIRequest } from './aiProxy';
export { proxyAIRequestStream } from './aiProxyStream';
export { proxyAIRequestStreamV2 } from './aiProxyStreamV2';

// Image Generation Proxy
export { proxyImageGeneration } from './imageProxy';

// Media Generation Proxy
export {
  proxyMediaGeneration,
  getMediaTaskStatus,
  listMediaProviderOptions,
  addElevenLabsSharedVoice,
} from './mediaProxy';
export {
  createDebateAudioCompileSession,
  compileDebateAudioPack,
} from './debateAudioCompile';

// Tool Execution (all server tools route through executeTool)
export { executeTool } from './tools';

// Stripe (Web Subscriptions)
export {
  createStripeCheckoutSession,
  createStripeBillingPortal,
  cancelStripeSubscription,
  stripeWebhook,
} from './stripe';

// Usage Tracking
export {
  getProviderBalances,
  getUsageStats,
  recordFreeTierInteraction,
  recordImageGeneration,
  recordMediaGeneration,
} from './usageTracking';

// Cloud payload storage quota/reservation management
export {
  reserveCloudPayloadUpload,
  finalizeCloudPayloadUpload,
  deleteCloudPayload,
  deleteCloudPayloadsForPath,
  deleteUserCloudData,
} from './cloudPayloadStorage';

// GDPR User Data Export
export { exportUserData } from './userData';

// Braveheart Contact Form
export { contactForm } from './contactForm';

// Symposium AI Feedback
export { symposiumFeedback } from './symposiumFeedback';

// In-app AI content reports
export { reportGeneratedContent } from './reportGeneratedContent';

// Apple Sign In Callback (handles form_post from Apple)
export { appleAuthCallback } from './appleAuthCallback';

// Export Pipeline (M4)
export { runExportJob } from './exports/runExportJob';
export { createExportJob } from './exports/createExportJob';
export { createHtmlPdfExport } from './exports/createHtmlPdfExport';
export { renderHtmlSnapshots } from './exports/renderHtmlSnapshots';

// Analyze remote Python sandbox (E2B)
export { sandboxExecute, sandboxFiles, sandboxSession, sandboxRetentionSweep } from './sandbox/callables';

// Analyze server-side loop (Phase 3; allowlisted until the v2.6 cutover)
export { analyzeStartTurn, analyzeRunControl, analyzeReviewControl, analyzeUploads } from './analyze/engine/callables';
export { analyzeRunStep } from './analyze/engine/step';
export { analyzeRunSweeper } from './analyze/engine/sweeper';
