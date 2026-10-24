import {describe, expect, it, vi} from 'vitest';
import {initialResearch, type ResearchDraft} from '@ecdys/shared';
import {ResearchSaveQueue} from './research-save';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {promise, resolve};
}
describe('research autosave recovery', () => {
  it('coalesces in-flight edits and flushes the latest draft using the acknowledged revision', async () => {
    const gate = deferred<void>(),
      calls: {revision: number; draft: ResearchDraft}[] = [];
    const report = vi.fn();
    const queue = new ResearchSaveQueue(
      7,
      async (input) => {
        calls.push(input);
        if (calls.length === 1) await gate.promise;
        return {...input.draft, revision: input.revision + 1, updatedAt: Date.now()};
      },
      report,
    );
    queue.update({...initialResearch(), title: 'First keystroke'});
    queue.update({...initialResearch(), title: 'Newer edit'});
    queue.update({...initialResearch(), title: 'Final edit'});
    const flushed = queue.flush();
    expect(calls).toHaveLength(1);
    gate.resolve();
    await flushed;
    expect(calls.map((input) => [input.revision, input.draft.title])).toEqual([
      [7, 'First keystroke'],
      [8, 'Final edit'],
    ]);
    expect(report).toHaveBeenLastCalledWith({state: 'saved'});
  });
  it('retains newer edits after a save failure and retries without silently replacing the revision', async () => {
    let fail = true;
    const report = vi.fn(),
      save = vi.fn(async (input: {revision: number; draft: ResearchDraft}) => {
        if (fail) throw new Error('Storage unavailable');
        return {...input.draft, revision: input.revision + 1, updatedAt: 1};
      });
    const queue = new ResearchSaveQueue(3, save, report);
    queue.update(initialResearch());
    await expect(queue.flush()).rejects.toThrow('Storage unavailable');
    queue.update({...initialResearch(), title: 'Keep these edits'});
    expect(save).toHaveBeenCalledTimes(1);
    fail = false;
    await queue.retry();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 3,
        draft: expect.objectContaining({title: 'Keep these edits'}),
      }),
    );
    expect(report).toHaveBeenLastCalledWith({state: 'saved'});
    queue.dispose();
    queue.update({...initialResearch(), title: 'Last write'});
    await queue.flush();
    expect(report).toHaveBeenLastCalledWith({state: 'saved'});
  });
});
