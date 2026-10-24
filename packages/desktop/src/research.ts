import type Database from 'better-sqlite3-multiple-ciphers';
import {
  ResearchDraftSchema,
  SaveResearchSchema,
  type ResearchDraft,
  type ResearchWorkspace,
} from '@ecdys/shared';
import {WorkspaceError} from './errors';

interface ResearchRow {
  document: string;
  revision: number;
  updated_at: number;
}
export class ResearchLibrary {
  constructor(private readonly db: Database.Database) {}
  read(): ResearchWorkspace {
    const row = this.db
      .prepare('SELECT document, revision, updated_at FROM research_workspace WHERE id = 1')
      .get() as ResearchRow | undefined;
    try {
      if (
        !row ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        !Number.isSafeInteger(row.updated_at) ||
        row.updated_at < 0
      )
        throw new Error();
      return {
        ...ResearchDraftSchema.parse(JSON.parse(row.document)),
        revision: row.revision,
        updatedAt: row.updated_at,
      };
    } catch {
      throw new WorkspaceError(
        'RESEARCH_RECOVERY_REQUIRED',
        'The research workspace is incomplete or invalid. Its contents were preserved; restore a vault backup.',
      );
    }
  }
  save(input: {revision: number; draft: ResearchDraft}): ResearchWorkspace {
    const {revision, draft} = SaveResearchSchema.parse(input);
    const updatedAt = Date.now();
    const result = this.db
      .prepare(
        'UPDATE research_workspace SET document = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?',
      )
      .run(JSON.stringify(draft), updatedAt, revision);
    if (!result.changes)
      throw new WorkspaceError(
        'REVISION_CONFLICT',
        'Research changed in another window. Your edits are still here. Reload the saved workspace before continuing.',
      );
    return {...draft, revision: revision + 1, updatedAt};
  }
}
