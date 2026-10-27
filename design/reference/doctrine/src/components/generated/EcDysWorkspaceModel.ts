import type { ExportWorkspace, Destination } from './EcDysBoundaryModel.ts';

export type Layout = {
  theme: 'dark' | 'light';
  density: 'normal' | 'compact';
  showSidebar: boolean;
  showContext: boolean;
  contextDock: 'right' | 'bottom';
  sidebarWidth: number;
  contextWidth: number;
};

export const defaultLayout: Layout = {
  theme: 'dark',
  density: 'normal',
  showSidebar: true,
  showContext: true,
  contextDock: 'right',
  sidebarWidth: 208,
  contextWidth: 256,
};

export type WorkspaceContent = {
  notes: ExportWorkspace['notes'];
  bookmarks: ExportWorkspace['bookmarks'];
  destinations: ExportWorkspace['destinations'];
  layout: Layout;
};

export type State = {
  content: WorkspaceContent;
  activity: ExportWorkspace['activity'];
  history: Array<{ content: WorkspaceContent; label: string }>;
  lastGroup?: string;
};

export type WorkspaceAction =
  | { type: 'change'; next: WorkspaceContent; label: string; at: string; eventId: string; message?: string; group?: string }
  | { type: 'event'; at: string; eventId: string; message: string }
  | { type: 'undo'; at: string; eventId: string }
  | { type: 'clear'; at: string; eventId: string };

function cloneDestination<T extends Destination>(destination: T): T {
  return { ...destination };
}

function copyContent(content: WorkspaceContent): WorkspaceContent {
  return {
    notes: content.notes.map(note => ({ ...note })),
    bookmarks: content.bookmarks.map(bookmark => ({ ...bookmark })),
    destinations: content.destinations.map(destination => cloneDestination(destination)),
    layout: { ...content.layout },
  };
}

export function createWorkspaceState(now: string): State {
  return {
    content: { notes: [], bookmarks: [], destinations: [], layout: { ...defaultLayout } },
    activity: [{ id: 'initial', at: now, message: 'Workspace initialized in this page.' }],
    history: [],
  };
}

/** Undo changes workspace content, never the record of actions already performed. */
export function workspaceReducer(state: State, action: WorkspaceAction): State {
  switch (action.type) {
    case 'change': {
      const group = action.group || undefined;
      const sameGroup = Boolean(group && group === state.lastGroup);
      const history = sameGroup
        ? state.history
        : [...state.history, { content: copyContent(state.content), label: action.label }].slice(-30);
      return {
        content: copyContent(action.next),
        activity: action.message
          ? [...state.activity, { id: action.eventId, at: action.at, message: action.message }]
          : state.activity,
        history,
        lastGroup: group,
      };
    }
    case 'event':
      return {
        ...state,
        activity: [...state.activity, { id: action.eventId, at: action.at, message: action.message }],
        lastGroup: undefined,
      };
    case 'undo': {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return {
        content: copyContent(previous.content),
        activity: [...state.activity, { id: action.eventId, at: action.at, message: `Undid: ${previous.label}.` }],
        history: state.history.slice(0, -1),
        lastGroup: undefined,
      };
    }
    case 'clear':
      return {
        content: { notes: [], bookmarks: [], destinations: [], layout: { ...state.content.layout } },
        activity: [{ id: action.eventId, at: action.at, message: 'Workspace data cleared from this preview.' }],
        history: [],
        lastGroup: undefined,
      };
  }
}
