import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import VerificationService, { VerificationStatus, VerificationResult } from '@/services/VerificationService';

export interface UseProviderVerificationReturn {
  verifiedProviders: string[];
  verificationTimestamps: Record<string, number>;
  verificationModels: Record<string, string>;
  verifyProvider: (providerId: string, result: VerificationResult) => Promise<void>;
  removeVerification: (providerId: string) => Promise<void>;
  clearAllVerifications: () => Promise<void>;
  getVerificationStatus: (providerId: string, hasApiKey: boolean) => VerificationStatus;
  getVerificationMessage: (providerId: string, hasApiKey: boolean) => string | undefined;
  getVerificationModel: (providerId: string) => string | undefined;
  isVerificationFresh: (providerId: string) => boolean;
  isVerificationStale: (providerId: string) => boolean;
  getVerificationAge: (providerId: string) => 'fresh' | 'recent' | 'stale' | 'none';
  getVerifiedCount: () => number;
  getUnverifiedProviders: (providerIds: string[]) => string[];
  areAllProvidersVerified: (providerIds: string[]) => boolean;
  getVerificationSummary: (providerIds: string[]) => {
    total: number;
    verified: number;
    fresh: number;
    stale: number;
    percentage: number;
  };
}

export const useProviderVerification = (): UseProviderVerificationReturn => {
  const dispatch = useDispatch();
  const verifiedProviders = useSelector((state: RootState) => state.settings.verifiedProviders || []);
  const verificationTimestamps = useSelector((state: RootState) => state.settings.verificationTimestamps || {});
  const verificationModels = useSelector((state: RootState) => state.settings.verificationModels || {});

  /**
   * Verify a provider and update state
   */
  const verifyProvider = useCallback(async (providerId: string, result: VerificationResult) => {
    await VerificationService.verifyProvider(providerId, dispatch, result);
  }, [dispatch]);

  /**
   * Remove verification for a provider
   */
  const removeVerification = useCallback(async (providerId: string) => {
    await VerificationService.removeVerification(providerId, dispatch);
  }, [dispatch]);

  /**
   * Clear all verifications
   */
  const clearAllVerifications = useCallback(async () => {
    await VerificationService.clearAllVerifications(dispatch);
  }, [dispatch]);

  /**
   * Get verification status for a provider
   */
  const getVerificationStatus = useCallback((providerId: string, hasApiKey: boolean): VerificationStatus => {
    return VerificationService.getVerificationStatus(
      providerId,
      verifiedProviders,
      verificationTimestamps,
      hasApiKey
    );
  }, [verifiedProviders, verificationTimestamps]);

  /**
   * Get verification message for display
   */
  const getVerificationMessage = useCallback((providerId: string, hasApiKey: boolean): string | undefined => {
    return VerificationService.formatVerificationMessage(
      providerId,
      verifiedProviders,
      verificationTimestamps,
      hasApiKey
    );
  }, [verifiedProviders, verificationTimestamps]);

  /**
   * Get verified model for a provider
   */
  const getVerificationModel = useCallback((providerId: string): string | undefined => {
    return verificationModels[providerId];
  }, [verificationModels]);

  /**
   * Check if verification is fresh (within last hour)
   */
  const isVerificationFresh = useCallback((providerId: string): boolean => {
    return VerificationService.isVerificationFresh(providerId, verificationTimestamps);
  }, [verificationTimestamps]);

  /**
   * Check if verification is stale (older than 24 hours)
   */
  const isVerificationStale = useCallback((providerId: string): boolean => {
    return VerificationService.isVerificationStale(providerId, verificationTimestamps);
  }, [verificationTimestamps]);

  /**
   * Get verification age status
   */
  const getVerificationAge = useCallback((providerId: string): 'fresh' | 'recent' | 'stale' | 'none' => {
    return VerificationService.getVerificationAge(providerId, verificationTimestamps);
  }, [verificationTimestamps]);

  /**
   * Get count of verified providers
   */
  const getVerifiedCount = useCallback((): number => {
    return VerificationService.getVerifiedCount(verifiedProviders);
  }, [verifiedProviders]);

  /**
   * Get unverified providers from a list
   */
  const getUnverifiedProviders = useCallback((providerIds: string[]): string[] => {
    return VerificationService.getUnverifiedProviders(providerIds, verifiedProviders);
  }, [verifiedProviders]);

  /**
   * Check if all providers in a list are verified
   */
  const areAllProvidersVerified = useCallback((providerIds: string[]): boolean => {
    return VerificationService.areAllProvidersVerified(providerIds, verifiedProviders);
  }, [verifiedProviders]);

  /**
   * Get verification summary for providers
   */
  const getVerificationSummary = useCallback((providerIds: string[]) => {
    return VerificationService.getVerificationSummary(
      providerIds,
      verifiedProviders,
      verificationTimestamps
    );
  }, [verifiedProviders, verificationTimestamps]);

  return {
    verifiedProviders,
    verificationTimestamps,
    verificationModels,
    verifyProvider,
    removeVerification,
    clearAllVerifications,
    getVerificationStatus,
    getVerificationMessage,
    getVerificationModel,
    isVerificationFresh,
    isVerificationStale,
    getVerificationAge,
    getVerifiedCount,
    getUnverifiedProviders,
    areAllProvidersVerified,
    getVerificationSummary,
  };
};