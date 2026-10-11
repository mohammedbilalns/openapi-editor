import { isTauri } from '../platform';
import { TauriWorkspaceAdapter } from './tauri-adapter';
import type { WorkspaceAdapter } from './types';
import { WebWorkspaceAdapter } from './web-adapter';

export * from './types';
export * from './web-adapter';
export * from './tauri-adapter';

let instance: WorkspaceAdapter | null = null;

export function getWorkspaceAdapter(): WorkspaceAdapter {
  if (!instance) {
    instance = isTauri() ? new TauriWorkspaceAdapter() : new WebWorkspaceAdapter();
  }
  return instance;
}

/** Override adapter instance (useful for testing or switching modes) */
export function setWorkspaceAdapter(adapter: WorkspaceAdapter | null): void {
  instance = adapter;
}
