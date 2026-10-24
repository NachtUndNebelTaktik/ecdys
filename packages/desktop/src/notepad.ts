import {createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID} from 'node:crypto';
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';
import {
  NOTEPAD_LOCAL_STORAGE_BYTES,
  NOTEPAD_MAX_FILE_BYTES,
  NOTEPAD_MAX_FILES,
  PRO_CLOUD_STORAGE_BYTES,
  NotepadDraftSchema,
  NotepadFileMetadataSchema,
  SaveNotepadSchema,
  type NotepadDocument,
  type NotepadDraft,
  type NotepadFile,
  type NotepadState,
} from '@ecdys/shared';
import {subkey} from './crypto';
import {WorkspaceError} from './errors';

const MAGIC = Buffer.from('ECDYSFILE1');
const HEADER_BYTES = MAGIC.length + 12 + 16;
type FileMetadata = Omit<NotepadFile, 'available'>;
function aad(file: FileMetadata) {
  return Buffer.from(
    JSON.stringify({
      format: 1,
      id: file.id,
      name: file.name,
      bytes: file.bytes,
      sha256: file.sha256,
    }),
  );
}
function readBounded(path: string, limit: number): Buffer {
  const fd = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0),
  );
  let data: Buffer | undefined;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new WorkspaceError('FILE_INVALID', 'Select a regular file.');
    if (stat.size > limit)
      throw new WorkspaceError('FILE_TOO_LARGE', 'Files can be up to 25 MiB in this build.');
    data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const count = readSync(fd, data, offset, data.length - offset, null);
      if (!count) break;
      offset += count;
    }
    const extra = Buffer.alloc(1);
    const extraCount = readSync(fd, extra, 0, 1, null),
      after = fstatSync(fd);
    extra.fill(0);
    if (
      offset !== data.length ||
      extraCount ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      throw new WorkspaceError(
        'FILE_CHANGED',
        'The file changed while being read. Select it again.',
      );
    return data;
  } catch (error) {
    data?.fill(0);
    throw error;
  } finally {
    closeSync(fd);
  }
}
export class NotepadLibrary {
  constructor(
    private db: Database.Database,
    private master: Buffer,
    private directory: string,
    private syncDirectory: (path: string) => void,
    private warn: (message: string) => void,
  ) {}
  note(): NotepadDocument {
    const row = this.db
      .prepare('SELECT title, body, revision, updated_at FROM notepad WHERE id = 1')
      .get() as {title: string; body: string; revision: number; updated_at: number} | undefined;
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
        ...NotepadDraftSchema.parse({title: row.title, body: row.body}),
        revision: row.revision,
        updatedAt: row.updated_at,
      };
    } catch {
      throw new WorkspaceError(
        'NOTEPAD_RECOVERY_REQUIRED',
        'The notepad is incomplete or invalid. Its contents were preserved; restore a vault backup.',
      );
    }
  }
  private metadata(): FileMetadata[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, bytes, sha256, created_at AS createdAt FROM notepad_files ORDER BY created_at DESC, id',
      )
      .all();
    const parsed = NotepadFileMetadataSchema.array().max(NOTEPAD_MAX_FILES).safeParse(rows);
    if (!parsed.success)
      throw new WorkspaceError(
        'NOTEPAD_RECOVERY_REQUIRED',
        'Saved file metadata is invalid. Its contents were preserved; restore a vault backup.',
      );
    return parsed.data;
  }
  private path(id: string) {
    return join(this.directory, id + '.enc');
  }
  private available(id: string) {
    try {
      return lstatSync(this.path(id)).isFile();
    } catch {
      return false;
    }
  }
  file(id: string): NotepadFile {
    const file = this.metadata().find((row) => row.id === id);
    if (!file) throw new WorkspaceError('FILE_NOT_FOUND', 'This saved file no longer exists.');
    return {...file, available: this.available(id)};
  }
  read(): NotepadState {
    const note = this.note(),
      files = this.metadata().map((file) => ({...file, available: this.available(file.id)}));
    return {
      note,
      files,
      usedBytes:
        files.reduce((total, file) => total + file.bytes, 0) +
        Buffer.byteLength(note.title + note.body),
      localLimitBytes: NOTEPAD_LOCAL_STORAGE_BYTES,
      cloud: {plan: 'Pro', allowanceBytes: PRO_CLOUD_STORAGE_BYTES, status: 'not_connected'},
    };
  }
  save(input: {revision: number; draft: NotepadDraft}): NotepadDocument {
    const {revision, draft} = SaveNotepadSchema.parse(input);
    if (
      this.metadata().reduce((total, file) => total + file.bytes, 0) +
        Buffer.byteLength(draft.title + draft.body) >
      NOTEPAD_LOCAL_STORAGE_BYTES
    )
      throw new WorkspaceError(
        'NOTEPAD_QUOTA',
        'The local notepad storage budget is full. Remove a saved file first.',
      );
    const updatedAt = Date.now();
    const result = this.db
      .prepare(
        'UPDATE notepad SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?',
      )
      .run(draft.title, draft.body, updatedAt, revision);
    if (!result.changes)
      throw new WorkspaceError(
        'REVISION_CONFLICT',
        'The notepad changed in another window. Your edits are still here. Reload the saved note before continuing.',
      );
    return {...draft, revision: revision + 1, updatedAt};
  }
  import(path: string): NotepadFile {
    const state = this.read();
    if (state.files.length >= NOTEPAD_MAX_FILES)
      throw new WorkspaceError('NOTEPAD_FULL', 'This notepad supports up to 200 saved files.');
    let data: Buffer | undefined, key: Buffer | undefined;
    let published = false;
    const id = randomUUID(),
      final = this.path(id),
      temporary = final + '.tmp';
    try {
      data = readBounded(path, NOTEPAD_MAX_FILE_BYTES);
      if (state.usedBytes + data.length > NOTEPAD_LOCAL_STORAGE_BYTES)
        throw new WorkspaceError(
          'NOTEPAD_QUOTA',
          'The local notepad storage budget is full. Remove a saved file first.',
        );
      const file = NotepadFileMetadataSchema.parse({
        id,
        name: basename(path),
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        createdAt: Date.now(),
      });
      key = subkey(this.master, 'ecdys:notepad-file:1:' + id);
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad(file));
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      mkdirSync(this.directory, {recursive: true, mode: 0o700});
      writeFileSync(temporary, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]), {
        mode: 0o600,
        flag: 'wx',
        flush: true,
      });
      renameSync(temporary, final);
      published = true;
      this.syncDirectory(this.directory);
      this.db
        .prepare(
          'INSERT INTO notepad_files (id, name, bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(file.id, file.name, file.bytes, file.sha256, file.createdAt);
      return {...file, available: true};
    } catch (error) {
      this.cleanup(temporary);
      if (published) this.cleanup(final);
      throw error;
    } finally {
      data?.fill(0);
      key?.fill(0);
    }
  }
  export(id: string, destination: string) {
    const {available, ...file} = this.file(id);
    if (!available)
      throw new WorkspaceError(
        'FILE_UNAVAILABLE',
        'The encrypted file is missing. Restore it from your vault backup.',
      );
    let encrypted: Buffer | undefined, data: Buffer | undefined, key: Buffer | undefined;
    let verified = false;
    const temporary = join(dirname(destination), '.ecdys-export-' + randomUUID() + '.tmp');
    try {
      encrypted = readBounded(this.path(id), NOTEPAD_MAX_FILE_BYTES + HEADER_BYTES);
      if (
        encrypted.length !== file.bytes + HEADER_BYTES ||
        !encrypted.subarray(0, MAGIC.length).equals(MAGIC)
      )
        throw new Error('Invalid envelope');
      key = subkey(this.master, 'ecdys:notepad-file:1:' + id);
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        encrypted.subarray(MAGIC.length, MAGIC.length + 12),
      );
      decipher.setAAD(aad(file));
      decipher.setAuthTag(encrypted.subarray(MAGIC.length + 12, HEADER_BYTES));
      data = Buffer.concat([decipher.update(encrypted.subarray(HEADER_BYTES)), decipher.final()]);
      if (
        data.length !== file.bytes ||
        createHash('sha256').update(data).digest('hex') !== file.sha256
      )
        throw new Error('Invalid content');
      verified = true;
      writeFileSync(temporary, data, {mode: 0o600, flag: 'wx', flush: true});
      renameSync(temporary, destination);
      try {
        this.syncDirectory(dirname(destination));
      } catch {
        this.warn(
          'The decrypted copy was exported, but directory durability could not be confirmed.',
        );
      }
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      // Integrity failures never replace a chosen destination; native I/O errors
      // get a separate code without exposing filenames or key material.
      if (!verified)
        throw new WorkspaceError(
          'FILE_INTEGRITY',
          'The saved file failed integrity verification. No decrypted copy was written.',
        );
      throw new WorkspaceError(
        'FILE_EXPORT_FAILED',
        'The file could not be exported. Check the selected location.',
      );
    } finally {
      data?.fill(0);
      key?.fill(0);
      encrypted?.fill(0);
      this.cleanup(temporary, true);
    }
  }
  remove(id: string) {
    this.file(id);
    this.db.prepare('DELETE FROM notepad_files WHERE id = ?').run(id);
    this.cleanup(this.path(id));
  }
  reconcile() {
    mkdirSync(this.directory, {recursive: true, mode: 0o700});
    const expected = new Set(this.metadata().map((file) => file.id + '.enc'));
    for (const name of readdirSync(this.directory))
      if (
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.enc(?:\.tmp)?$/.test(
          name,
        ) &&
        !expected.has(name)
      )
        this.cleanup(join(this.directory, name));
    if ([...expected].some((name) => !existsSync(join(this.directory, name))))
      this.warn(
        'Some encrypted notepad files are missing. Restore the notepad-files directory from your vault backup.',
      );
  }
  private cleanup(path: string, exported = false) {
    try {
      unlinkSync(path);
      this.syncDirectory(dirname(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.warn(
          exported
            ? 'An incomplete decrypted export could not be removed from the selected folder. Remove its .ecdys-export temporary file manually.'
            : 'Some unreferenced notepad files could not be removed. Cleanup will retry on unlock.',
        );
    }
  }
}
