/**
 * Static security assertions over the consolidated Firestore rules.
 * This repo is the single source of truth for rules deployed to the
 * symposium-ai project (serving both mobile and web). Ported from the
 * symposium-ai-web repo when rules ownership consolidated here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

describe('firestore entitlement rules', () => {
  it('keeps entitlement and usage fields out of client-owned user writes', () => {
    expect(rules).toContain('function serverOwnedEntitlementFields()');
    [
      'membershipStatus',
      'isPremium',
      'hasUsedTrial',
      'trialStartedAt',
      'trialEndsAt',
      'subscriptionStartedAt',
      'subscriptionEndsAt',
      'subscriptionPlan',
      'subscriptionSource',
      'freeDebatesRemaining',
      'freeComparesRemaining',
      'freeChatsRemaining',
      'freeAnalyzesRemaining',
      'productId',
      'subscriptionId',
      'androidPurchaseToken',
      'appAccountToken',
      'lastReceiptData',
      'isLifetime',
      'paymentPlatform',
    ].forEach((serverOwnedField) => {
      expect(rules).toContain(`'${serverOwnedField}'`);
    });
    expect(rules).toContain(
      "!request.resource.data.diff(resource.data).affectedKeys().hasAny(serverOwnedEntitlementFields())",
    );
  });

  it('only allows inert entitlement values on user-document create', () => {
    expect(rules).toContain('function entitlementFieldsAreInertDefaults()');
    expect(rules).toContain("d.get('membershipStatus', 'demo') == 'demo'");
    expect(rules).toContain("d.get('isPremium', false) == false");
    expect(rules).toContain("d.get('hasUsedTrial', false) == false");
    expect(rules).toContain('allow create: if isOwner(userId) && isValidUserCreate();');
    expect(rules).toContain('allow update: if isOwner(userId) && isValidUserUpdate();');
  });

  it('makes billing, usage, subscription, and reservations read-only for clients', () => {
    expect(rules).toMatch(/match \/billing\/\{docId=\*\*\} \{\s+allow read: if isOwner\(userId\);\s+allow write: if false;\s+\}/);
    expect(rules).toMatch(/match \/usage\/\{docId=\*\*\} \{\s+allow read: if isOwner\(userId\);\s+allow write: if false;\s+\}/);
    expect(rules).toMatch(/match \/subscription\/\{docId=\*\*\} \{\s+allow read: if isOwner\(userId\);\s+allow write: if false;\s+\}/);
    expect(rules).toMatch(/match \/storageReservations\/\{reservationId\} \{\s+allow read: if isOwner\(userId\);\s+allow write: if false;\s+\}/);
  });

  it('lets clients only mark their run notifications read', () => {
    expect(rules).toMatch(/match \/notifications\/\{notificationId\} \{\s+allow read: if isOwner\(userId\);\s+allow update: if isOwner\(userId\)\s+&& request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['read'\]\)\s+&& request\.resource\.data\.read is bool;\s+allow create, delete: if false;\s+\}/);
  });

  it('does not allow broad client writes to users documents', () => {
    expect(rules).not.toContain('allow read, write: if request.auth != null && request.auth.uid == userId;');
  });

  it('blocks all client access to apiKeys and receipts', () => {
    expect(rules).toMatch(/match \/apiKeys\/\{providerId\} \{\s+allow read, write: if false;\s+\}/);
    expect(rules).toMatch(/match \/receipts\/\{docId\} \{\s+allow read, write: if false;\s+\}/);
  });

  it('restricts settings writes to allowlisted keys on create and update', () => {
    expect(rules).toContain('allow create: if isOwner(userId) && validSettingsDocument(settingId);');
    expect(rules).toContain('allow update: if isOwner(userId) && validSettingsUpdate(settingId);');
    expect(rules).toContain("changed.hasOnly(['theme', 'userDefaults'])");
  });

  it('makes trialHistory server-owned with self-read only', () => {
    expect(rules).toMatch(/match \/trialHistory\/\{docId\} \{\s+allow read: if signedIn\(\) && request\.auth\.uid == docId;\s+allow write: if false;\s+\}/);
  });

  it('does not expose login attempt rate-limit state to clients', () => {
    const loginAttemptsMatch = rules.match(/match \/loginAttempts\/\{emailId\} \{([\s\S]*?)\n {4}\}/);
    expect(loginAttemptsMatch?.[1]).toContain('allow read, write: if false;');
    expect(loginAttemptsMatch?.[1]).not.toContain('if true');
  });

  it('prevents reassigning legacy conversations to another user', () => {
    const conversationsMatch = rules.match(/\/\/ Legacy: Conversations collection[\s\S]*?match \/conversations\/\{sessionId\} \{([\s\S]*?)\/\/ Messages subcollection/);
    expect(conversationsMatch?.[1]).toContain('request.resource.data.userId == request.auth.uid');
  });

  it('constrains purchase_errors to create-only with a known payload shape', () => {
    const purchaseErrorsMatch = rules.match(/match \/purchase_errors\/\{docId\} \{([\s\S]*?)\n {4}\}/);
    expect(purchaseErrorsMatch?.[1]).toContain('allow read, update, delete: if false;');
    expect(purchaseErrorsMatch?.[1]).toContain('hasOnly');
    expect(purchaseErrorsMatch?.[1]).not.toMatch(/allow create: if true;?\s*$/m);
  });

  it('denies everything not explicitly matched', () => {
    expect(rules).toMatch(/match \/\{document=\*\*\} \{\s+allow read, write: if false;\s+\}/);
  });
});
