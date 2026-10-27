import type {WorkspaceStatus} from '../../shared/src/model';

export type WorkspaceState = 'unknown' | 'locked' | 'unlocked' | 'preview';
export type SnapshotHistoryState = 'unknown' | 'loading' | 'ready' | 'error';

export function workspaceState(status: WorkspaceStatus | undefined, bridge: boolean): WorkspaceState {
  if (!bridge) return 'preview';
  if (!status) return 'unknown';
  return status.unlocked ? 'unlocked' : 'locked';
}
