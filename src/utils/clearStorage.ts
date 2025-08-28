import { StorageService } from '../services/chat';

export const clearAllStorage = async (): Promise<void> => {
  console.log('Clearing all storage...');
  await StorageService.clearAllSessions();
  console.log('Storage cleared successfully');
};