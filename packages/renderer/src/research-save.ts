import type {ResearchDraft} from '@ecdys/shared';

export type ResearchSaveState = {state: 'saved' | 'saving' | 'error'; message?: string};

// Coalesce edits made during a write, and never let an older response replace
// newer edits. A failed write holds the draft until an explicit retry/reload.
export class VaultSaveQueue<T> {
  private draft?: T;
  private generation = 0;
  private savedGeneration = 0;
  private pending?: Promise<void>;
  private failure?: unknown;
  private active = true;
  constructor(
    private revision: number,
    private save: (input: {revision: number; draft: T}) => Promise<{revision: number}>,
    private report: (state: ResearchSaveState) => void,
  ) {}
  update(draft: T) {
    this.draft = draft;
    this.generation++;
    if (!this.failure) void this.flush().catch(() => undefined);
  }
  async flush(): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.pending) {
      await this.pending;
      return this.flush();
    }
    if (!this.draft || this.generation === this.savedGeneration) return;
    const draft = this.draft,
      generation = this.generation;
    this.notify({state: 'saving'});
    this.pending = this.save({revision: this.revision, draft})
      .then((saved) => {
        this.revision = saved.revision;
        this.savedGeneration = generation;
      })
      .catch((error: unknown) => {
        this.failure = error;
        this.notify({
          state: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Research could not be saved. Your edits are still here.',
        });
        throw error;
      })
      .finally(() => {
        this.pending = undefined;
      });
    await this.pending;
    await this.flush();
    if (this.generation === this.savedGeneration) this.notify({state: 'saved'});
  }
  async retry() {
    this.failure = undefined;
    return this.flush();
  }
  dispose() {
    this.active = false;
  }
  private notify(state: ResearchSaveState) {
    if (this.active) this.report(state);
  }
}
export class ResearchSaveQueue extends VaultSaveQueue<ResearchDraft> {}
