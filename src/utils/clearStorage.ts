import { StorageService } from '../services/chat';

export const clearAllStorage = async (): Promise<void> => {
  await StorageService.clearAllSessions();
};