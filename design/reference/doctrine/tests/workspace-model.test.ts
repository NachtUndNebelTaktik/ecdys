import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceState, workspaceReducer, defaultLayout, type State, type WorkspaceContent } from '../src/components/generated/EcDysWorkspaceModel.ts';

const time = '2026-10-27T05:30:00.000Z';
const note = { id: 'n1', title: 'Field notes', body: 'Original text', updatedAt: time };
const bookmark = { id: 'b1', title: 'Reference', url: 'https://example.org', createdAt: time };
const destination = { id: 'd1', url: 'https://example.org/path', recipient: 'example.org', kind: 'address' as const, payload: 'https://example.org/path', scheme: 'https' as const, preparedAt: time };
function seed(): State {
  const state = createWorkspaceState(time);
  return { ...state, content: { ...state.content, notes: [{ ...note }], bookmarks: [{ ...bookmark }], destinations: [{ ...destination }] } };
}
function change(state: State, next: WorkspaceContent, label: string, group?: string, message?: string): State {
  return workspaceReducer(state, { type: 'change', next, label, group, message, at: time, eventId: `change-${state.history.length}-${state.activity.length}` });
}
function undo(state: State): State {
  return workspaceReducer(state, { type: 'undo', at: time, eventId: `undo-${state.activity.length}` });
}

test('initial state has empty content and one accurately dated initialization event', () => {
  const state = createWorkspaceState(time);
  assert.deepEqual(state.content, { notes: [], bookmarks: [], destinations: [], layout: defaultLayout });
  assert.deepEqual(state.activity, [{ id: 'initial', at: time, message: 'Workspace initialized in this page.' }]);
  state.content.layout.theme = 'light';
  assert.equal(defaultLayout.theme, 'dark');
});

test('undo restores notes, bookmarks, destinations, and layout changes', () => {
  const state = seed();
  for (const [next, label] of [
    [{ ...state.content, notes: [] }, 'Remove note'],
    [{ ...state.content, bookmarks: [] }, 'Remove bookmark'],
    [{ ...state.content, destinations: [] }, 'Close destination'],
    [{ ...state.content, layout: { ...state.content.layout, theme: 'light' as const, showContext: false } }, 'Change layout'],
  ] as Array<[WorkspaceContent, string]>) {
    const edited = change(state, next, label);
    const restored = undo(edited);
    assert.deepEqual(restored.content, state.content, label);
    assert.equal(restored.history.length, 0);
    assert.equal(restored.activity.at(-1)?.message, `Undid: ${label}.`);
  }
});

test('consecutive grouped note typing retains the original snapshot', () => {
  const original = seed();
  let state = original;
  for (const body of ['O', 'Or', 'Original revised']) {
    state = change(state, { ...state.content, notes: [{ ...note, body }] }, 'Edit note', 'typing:n1');
  }
  assert.equal(state.history.length, 1);
  assert.deepEqual(undo(state).content, original.content);
  assert.equal(state.activity.length, 1, 'unreported edits do not invent activity events');
});

test('ungrouped changes and intervening events establish new undo groups', () => {
  let state = seed();
  state = change(state, { ...state.content, notes: [{ ...note, body: 'First edit' }] }, 'Edit note', 'typing:n1');
  state = workspaceReducer(state, { type: 'event', at: time, eventId: 'boundary', message: 'External open requested.' });
  state = change(state, { ...state.content, notes: [{ ...note, body: 'Second edit' }] }, 'Edit note', 'typing:n1');
  assert.equal(state.history.length, 2);
  assert.equal(undo(state).content.notes[0].body, 'First edit');
});

test('undo preserves all activity and adds its own real event', () => {
  let state = seed();
  state = change(state, { ...state.content, bookmarks: [] }, 'Remove bookmark', undefined, 'Bookmark removed from workspace.');
  state = workspaceReducer(state, { type: 'event', at: time, eventId: 'request', message: 'External open requested.' });
  const before = [...state.activity];
  const after = undo(state);
  assert.deepEqual(after.activity.slice(0, -1), before);
  assert.equal(after.activity.at(-1)?.message, 'Undid: Remove bookmark.');
  assert.equal(after.content.bookmarks.length, 1);
});

test('undo is a no-op without history', () => {
  const state = createWorkspaceState(time);
  assert.strictEqual(undo(state), state);
});

test('history is capped at thirty and only the retained changes can be undone', () => {
  let state = seed();
  for (let width = 209; width <= 243; width++) {
    state = change(state, { ...state.content, layout: { ...state.content.layout, sidebarWidth: width } }, `Resize sidebar ${width}`);
  }
  assert.equal(state.history.length, 30);
  for (let i = 0; i < 30; i++) state = undo(state);
  assert.equal(state.content.layout.sidebarWidth, 213);
  assert.equal(state.history.length, 0);
  assert.strictEqual(undo(state), state);
});

test('clear removes content, retained history, and prior activity while retaining layout', () => {
  const original = seed();
  const edited = change(original, { ...original.content, layout: { ...original.content.layout, theme: 'light', contextDock: 'bottom' } }, 'Change layout', undefined, 'Layout changed.');
  const state = workspaceReducer(edited, { type: 'clear', at: time, eventId: 'clear' });
  assert.deepEqual(state.content, { notes: [], bookmarks: [], destinations: [], layout: edited.content.layout });
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.activity, [{ id: 'clear', at: time, message: 'Workspace data cleared from this preview.' }]);
  assert.strictEqual(undo(state), state);
  assert.equal(original.content.notes.length, 1);
  assert.ok(edited.history.length > 0);
});

test('changes do not mutate input state or retain mutable action content aliases', () => {
  const state = seed();
  const before = structuredClone(state);
  const next = structuredClone(state.content);
  next.notes[0].body = 'Changed';
  const result = change(state, next, 'Edit note');
  assert.deepEqual(state, before);
  next.notes[0].body = 'Outside mutation';
  next.layout.theme = 'light';
  assert.equal(result.content.notes[0].body, 'Changed');
  assert.equal(result.content.layout.theme, 'dark');
  result.content.notes[0].body = 'Later modification';
  assert.equal(result.history[0].content.notes[0].body, 'Original text');
});
