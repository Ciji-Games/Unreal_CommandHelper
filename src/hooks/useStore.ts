/**
 * Shared store instance for persistence.
 * Uses LazyStore so it loads on first access.
 */

import { LazyStore } from '@tauri-apps/plugin-store';
import { STORE_PATH } from '../config';

let storeInstance: LazyStore | null = null;

export async function getStore(): Promise<LazyStore> {
  if (!storeInstance) {
    storeInstance = new LazyStore(STORE_PATH);
    await storeInstance.init();
  }
  return storeInstance;
}
