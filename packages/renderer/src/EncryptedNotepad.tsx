import {createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {
  NOTEPAD_MAX_FILES,
  NotepadDraftSchema,
  type EcdysApi,
  type NotepadDraft,
  type NotepadFile,
  type NotepadState,
} from '@ecdys/shared';
import {VaultSaveQueue, type ResearchSaveState} from './research-save';
import {Modal} from './Modal';

export function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MiB';
}
export function EncryptedNotepad(props: {
  api: EcdysApi;
  registerFlush: (flush?: () => Promise<void>) => void;
}) {
  const [state, setState] = createSignal<NotepadState>();
  const [draft, setDraft] = createSignal<NotepadDraft>({title: 'Encrypted notepad', body: ''});
  const [saveState, setSaveState] = createSignal<ResearchSaveState>({state: 'saved'});
  const [error, setError] = createSignal(''),
    [notice, setNotice] = createSignal('');
  const [busy, setBusy] = createSignal(false),
    [loading, setLoading] = createSignal(true);
  const [removing, setRemoving] = createSignal<NotepadFile>(),
    [reloading, setReloading] = createSignal(false);
  let saver: VaultSaveQueue<NotepadDraft> | undefined,
    disposed = false;
  async function load() {
    setLoading(true);
    setError('');
    try {
      const next = await props.api.notepad();
      if (disposed) return;
      saver?.dispose();
      setState(next);
      setDraft({title: next.note.title, body: next.note.body});
      setSaveState({state: 'saved'});
      saver = new VaultSaveQueue(
        next.note.revision,
        (input) => props.api.saveNotepad(input),
        setSaveState,
      );
    } catch (reason) {
      if (!disposed)
        setError(reason instanceof Error ? reason.message : 'The notepad could not be opened.');
    } finally {
      if (!disposed) setLoading(false);
    }
  }
  onMount(() => {
    props.registerFlush(() => saver?.flush() || Promise.resolve());
    void load();
  });
  onCleanup(() => {
    disposed = true;
    saver?.dispose();
    props.registerFlush();
  });
  function update(patch: Partial<NotepadDraft>) {
    const parsed = NotepadDraftSchema.safeParse({...draft(), ...patch});
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'This note is too large.');
      return;
    }
    setDraft(parsed.data);
    setError('');
    setNotice('');
    saver?.update(parsed.data);
  }
  async function filesChanged() {
    const next = await props.api.notepad();
    if (!disposed) setState(next); // Keep the current editor draft and save queue.
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (reason) {
      if (!disposed)
        setError(
          reason instanceof Error ? reason.message : 'The file operation could not be completed.',
        );
    } finally {
      if (!disposed) setBusy(false);
    }
  }
  return (
    <section class="encrypted-notepad" aria-label="Encrypted notepad">
      <header class="notepad-heading">
        <div>
          <span class="stamp">KEEP IT WITH YOUR RESEARCH</span>
          <h2>Encrypted notepad</h2>
          <p>Private notes and files, saved in your workspace.</p>
        </div>
        <span class="pill notepad-encrypted">
          <span class="status-dot" />
          LOCAL · ENCRYPTED
        </span>
      </header>
      <Show when={error()}>
        <div class="message error" role="alert">
          {error()}
          <button aria-label="Dismiss notepad error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      </Show>
      <Show when={saveState().state === 'error'}>
        <div class="message error" role="alert">
          <span>{saveState().message}</span>
          <button onClick={() => void saver?.retry().catch(() => undefined)}>
            Retry notepad save
          </button>
          <button onClick={() => setReloading(true)}>Reload saved note</button>
        </div>
      </Show>
      <Show when={notice()}>
        <div class="message" role="status">
          {notice()}
        </div>
      </Show>
      <Show when={!loading()} fallback={<p class="notepad-loading">Opening encrypted notepad…</p>}>
        <Show
          when={state()}
          fallback={
            <button class="button" onClick={() => void load()}>
              Retry opening notepad
            </button>
          }
        >
          <div class="notepad-layout">
            <div class="notepad-editor">
              <div class="notepad-editor-bar">
                <input
                  aria-label="Notepad title"
                  maxLength={100}
                  value={draft().title}
                  onChange={(event) => {
                    if (event.currentTarget.value.trim())
                      update({title: event.currentTarget.value});
                    else event.currentTarget.value = draft().title;
                  }}
                />
                <span class="tiny">PLAIN TEXT</span>
              </div>
              <textarea
                aria-label="Encrypted notepad text"
                maxLength={180000}
                spellcheck={false}
                placeholder="Keep a thought, a lead, a checklist…&#10;&#10;Your notes stay with your workspace."
                value={draft().body}
                onInput={(event) => update({body: event.currentTarget.value})}
              />
              <div class="notepad-editor-footer">
                <span role="status" aria-label="Notepad save status">
                  <span class={saveState().state === 'saved' ? 'status-dot' : 'amber-dot'} />
                  {saveState().state === 'saved'
                    ? 'Saved to encrypted vault'
                    : saveState().state === 'saving'
                      ? 'Saving note…'
                      : 'Changes need saving'}
                </span>
                <span>{draft().body.length.toLocaleString()} characters</span>
              </div>
            </div>
            <aside class="notepad-files" aria-label="Encrypted saved files">
              <header>
                <div>
                  <span class="stamp">SAVED FILES</span>
                  <h3>
                    {state()!.files.length
                      ? state()!.files.length +
                        (state()!.files.length === 1 ? ' encrypted file' : ' encrypted files')
                      : 'Files stay here, too.'}
                  </h3>
                </div>
                <button
                  class="button subtle"
                  disabled={busy() || state()!.files.length >= NOTEPAD_MAX_FILES}
                  onClick={() =>
                    void run(async () => {
                      const file = await props.api.importNotepadFile();
                      if (file) {
                        await filesChanged();
                        setNotice('File encrypted and saved. The original file was left in place.');
                      }
                    })
                  }
                >
                  ＋ Save file
                </button>
              </header>
              <Show
                when={state()!.files.length}
                fallback={
                  <div class="notepad-files-empty">
                    <span aria-hidden="true">▤</span>
                    <p>Save documents, evidence or working files alongside your notes.</p>
                    <small>Files are encrypted before they enter your vault.</small>
                  </div>
                }
              >
                <div class="notepad-file-list">
                  <For each={state()!.files}>
                    {(file) => (
                      <article class="notepad-file">
                        <span class="notepad-file-icon" aria-hidden="true">
                          ▤
                        </span>
                        <div>
                          <strong title={file.name}>{file.name}</strong>
                          <small>
                            {formatFileBytes(file.bytes)} ·{' '}
                            {file.available ? 'Encrypted' : 'File missing'}
                          </small>
                        </div>
                        <button
                          class="icon-button"
                          aria-label={'Export decrypted copy of ' + file.name}
                          title="Export a decrypted copy"
                          disabled={busy() || !file.available}
                          onClick={() =>
                            void run(async () => {
                              if (await props.api.exportNotepadFile(file.id))
                                setNotice('Decrypted copy exported to your selected location.');
                            })
                          }
                        >
                          ↗
                        </button>
                        <button
                          class="icon-button"
                          aria-label={'Remove saved file ' + file.name}
                          title="Remove saved file"
                          disabled={busy()}
                          onClick={() => setRemoving(file)}
                        >
                          ×
                        </button>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
              <footer>
                <span>{formatFileBytes(state()!.usedBytes)} saved locally</span>
                <span>Up to 25 MiB per file</span>
              </footer>
            </aside>
          </div>
          <div class="notepad-cloud">
            <span class="notepad-cloud-icon" aria-hidden="true">
              ☁
            </span>
            <div>
              <strong>Pro includes 1 GB cloud storage</strong>
              <p>Encrypted notes and files across your devices.</p>
            </div>
            <span class="pill">CLOUD NOT CONNECTED</span>
          </div>
        </Show>
      </Show>
      <Show when={removing()}>
        {(file) => (
          <Modal
            title={'Remove ' + file().name + '?'}
            subtitle="This removes the encrypted copy from your notepad. Your original file and any exported copies are kept."
            close={() => setRemoving()}
          >
            <div class="modal-actions">
              <button class="button" onClick={() => setRemoving()}>
                Keep file
              </button>
              <button
                class="button danger"
                disabled={busy()}
                onClick={() =>
                  void run(async () => {
                    await props.api.removeNotepadFile(file().id);
                    await filesChanged();
                    setRemoving();
                  })
                }
              >
                Remove encrypted file
              </button>
            </div>
          </Modal>
        )}
      </Show>
      <Show when={reloading()}>
        <Modal
          title="Reload the saved note?"
          subtitle="Unsaved edits in this notepad will be replaced with the version saved in the vault. Copy anything you need to keep first."
          close={() => setReloading(false)}
        >
          <div class="modal-actions">
            <button class="button" onClick={() => setReloading(false)}>
              Keep editing
            </button>
            <button
              class="button danger"
              onClick={() => {
                setReloading(false);
                void load();
              }}
            >
              Reload note
            </button>
          </div>
        </Modal>
      </Show>
    </section>
  );
}
