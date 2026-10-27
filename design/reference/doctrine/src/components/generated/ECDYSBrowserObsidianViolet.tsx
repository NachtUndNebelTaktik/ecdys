import { useEffect, useReducer, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { prepareDestination, createWorkspaceExport, type ExportSelection } from './EcDysBoundaryModel';
import { createWorkspaceState, workspaceReducer, defaultLayout, type WorkspaceContent, type Layout } from './EcDysWorkspaceModel';
import './ECDYSBrowserObsidianViolet.css';
type IconName = 'start' | 'note' | 'bookmark' | 'activity' | 'layout' | 'info' | 'arrow' | 'external' | 'plus' | 'close' | 'search' | 'export' | 'undo' | 'menu' | 'panel' | 'check' | 'trash';
function Icon({
  name,
  size = 18
}: {
  name: IconName;
  size?: number;
}) {
  const paths: Record<IconName, ReactNode> = {
    start: <><path d="m4 10 8-6 8 6v10H4V10Z" /><path d="M9 20v-7h6v7" /></>,
    note: <><path d="M5 3h10l4 4v14H5V3Z" /><path d="M14 3v5h5M8 12h8M8 16h6" /></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    activity: <><path d="M4 5h16M4 12h16M4 19h16" /><path d="M8 3v4M16 10v4M11 17v4" /></>,
    layout: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M8 4v16M17 4v16" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    external: <><path d="M14 4h6v6m0-6-9 9M9 4H4v16h16v-5" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    close: <path d="m6 6 12 12M6 18 12-12" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    export: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    undo: <><path d="M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    panel: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M15 4v16" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    trash: <><path d="M4 6h16M9 3h6l1 3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const id = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();
const time = (value: string) => `${value.slice(0, 19).replace('T', ' ')} UTC`;
type Route = 'start' | 'notes' | 'bookmarks' | 'activity' | 'layout' | 'capabilities' | 'destination';
type Modal = 'export' | 'bookmark' | 'clear' | 'command' | null;
type Problem = {
  happened: string;
  meaning: string;
  next: string;
};
const emptySelection: ExportSelection = {
  notes: false,
  bookmarks: false,
  activity: false,
  destinations: false
};
const routeLabels: Record<Route, string> = {
  start: 'Start',
  notes: 'Notes',
  bookmarks: 'Bookmarks',
  activity: 'Activity',
  layout: 'Layout',
  capabilities: 'Capabilities',
  destination: 'Prepared destination'
};
function Status({
  active,
  children
}: {
  active: boolean;
  children: ReactNode;
}) {
  return <span className="dx-status"><span className="dx-status-dot" data-active={active} aria-hidden="true" /><span>{children}</span></span>;
}
function ErrorMessage({
  problem
}: {
  problem: Problem | null;
}) {
  return problem ? <div className="dx-error" role="alert"><strong>{problem.happened}</strong><p>{problem.meaning}</p><p>{problem.next}</p></div> : null;
}
export const ECDYSBrowserObsidianViolet = ({ initialTheme = 'dark' }: { initialTheme?: Layout['theme'] } = {}) => {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, () => {
    const initial = createWorkspaceState(now());
    return { ...initial, content: { ...initial.content, layout: { ...initial.content.layout, theme: initialTheme } } };
  });
  const {
    content,
    activity,
    history
  } = state;
  const {
    notes,
    bookmarks,
    destinations,
    layout
  } = content;
  const [route, setRoute] = useState<Route>('start');
  const [activeDestinationId, setActiveDestinationId] = useState('');
  const [openingRequests, setOpeningRequests] = useState<Record<string, string>>({});
  const [activeNoteId, setActiveNoteId] = useState('');
  const [address, setAddress] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [modalProblem, setModalProblem] = useState<Problem | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selection, setSelection] = useState<ExportSelection>({
    ...emptySelection
  });
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkUrl, setBookmarkUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [command, setCommand] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [navVisible, setNavVisible] = useState(false);
  const [contextVisible, setContextVisible] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const noteDirty = useRef<string | null>(null);
  const historyAvailable = useRef(false);
  historyAvailable.current = history.length > 0;
  const activeDestination = destinations.find(d => d.id === activeDestinationId);
  const activeRequestAt = activeDestination ? openingRequests[activeDestination.id] : undefined;
  const activeNote = notes.find(n => n.id === activeNoteId) || notes[0];
  const recentAction = history[history.length - 1]?.label;
  function change(next: WorkspaceContent, label: string, message?: string, group?: string) {
    dispatch({
      type: 'change',
      next,
      label,
      message,
      group,
      at: now(),
      eventId: id()
    });
  }
  function record(message: string) {
    dispatch({
      type: 'event',
      message,
      at: now(),
      eventId: id()
    });
  }
  function navigate(next: Route) {
    setRoute(next);
    setProblem(null);
    setNavVisible(false);
    setContextVisible(false);
  }
  function openModal(next: Modal) {
    setModalProblem(null);
    setNotice('');
    if (next === 'export') setSelection({
      ...emptySelection
    });
    if (next === 'command') {
      setCommand('');
      setCommandIndex(0);
    }
    setModal(next);
  }
  function undo() {
    dispatch({
      type: 'undo',
      at: now(),
      eventId: id()
    });
    setProblem(null);
    setNotice('');
  }
  function updateLayout(patch: Partial<Layout>, label = 'Change layout', group?: string) {
    change({
      ...content,
      layout: {
        ...layout,
        ...patch
      }
    }, label, `${label}.`, group);
  }
  function stage(raw: string) {
    const result = prepareDestination(raw);
    if (result.ok === false) {
      setProblem(result.error);
      return;
    }
    const prepared = {
      ...result.destination,
      id: id(),
      preparedAt: now()
    };
    change({
      ...content,
      destinations: [...destinations, prepared]
    }, 'Prepare destination', `Destination prepared: ${prepared.recipient}.`);
    setActiveDestinationId(prepared.id);
    setAddress('');
    setProblem(null);
    setModal(null);
    setRoute('destination');
    setNavVisible(false);
  }
  function closeDestination(destinationId: string) {
    const target = destinations.find(d => d.id === destinationId);
    change({
      ...content,
      destinations: destinations.filter(d => d.id !== destinationId)
    }, 'Close prepared destination', `Prepared destination removed: ${target?.recipient || destinationId}.`);
    if (destinationId === activeDestinationId) {
      setActiveDestinationId('');
      setRoute('start');
    }
  }
  function addNote() {
    const note = {
      id: id(),
      title: 'Untitled note',
      body: '',
      updatedAt: now()
    };
    change({
      ...content,
      notes: [...notes, note]
    }, 'Create note', 'Note created in page memory.');
    setActiveNoteId(note.id);
    navigate('notes');
  }
  function editNote(field: 'title' | 'body', value: string) {
    if (!activeNote) return;
    const noteId = activeNote.id;
    noteDirty.current = noteId;
    change({
      ...content,
      notes: notes.map(n => n.id === noteId ? {
        ...n,
        [field]: value,
        updatedAt: now()
      } : n)
    }, 'Edit note', undefined, `edit-note-${noteId}`);
  }
  function finishNoteEdit() {
    if (noteDirty.current) {
      record(`Note updated: ${noteDirty.current}.`);
      noteDirty.current = null;
    }
  }
  function removeNote(noteId: string) {
    change({
      ...content,
      notes: notes.filter(n => n.id !== noteId)
    }, 'Remove note', `Note removed from workspace; undo remains available: ${noteId}.`);
    if (activeNoteId === noteId) setActiveNoteId('');
  }
  function openBookmarkForm() {
    openModal('bookmark');
  }
  function addBookmark(event: FormEvent) {
    event.preventDefault();
    const result = prepareDestination(bookmarkUrl);
    if (result.ok === false) {
      setModalProblem(result.error);
      return;
    }
    if (result.destination.kind === 'search') {
      setModalProblem({
        happened: 'The bookmark needs a website address.',
        meaning: 'The entered text would become a search query.',
        next: 'Enter a complete HTTP or HTTPS address, then add the bookmark.'
      });
      return;
    }
    const bookmark = {
      id: id(),
      title: bookmarkTitle.trim() || result.destination.recipient,
      url: result.destination.url,
      createdAt: now()
    };
    change({
      ...content,
      bookmarks: [...bookmarks, bookmark]
    }, 'Add bookmark', `Bookmark added: ${result.destination.recipient}.`);
    setBookmarkTitle('');
    setBookmarkUrl('');
    setModal(null);
    navigate('bookmarks');
  }
  function removeBookmark(bookmarkId: string) {
    change({
      ...content,
      bookmarks: bookmarks.filter(b => b.id !== bookmarkId)
    }, 'Remove bookmark', `Bookmark removed from workspace; undo remains available: ${bookmarkId}.`);
  }
  function recordExternalRequest() {
    if (!activeDestination) return;
    const at = now();
    setOpeningRequests(previous => ({
      ...previous,
      [activeDestination.id]: at
    }));
    record(`External opening requested: ${activeDestination.recipient}. Completion is not observed.`);
  }
  function requestDownload(filename: string, text: string) {
    const blob = new Blob([text], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  }
  function exportWorkspace() {
    try {
      const exportedDestinations = destinations.map(destination => ({
        ...destination,
        ...(openingRequests[destination.id] ? {
          requestedAt: openingRequests[destination.id]
        } : {})
      }));
      const result = createWorkspaceExport({
        notes,
        bookmarks,
        destinations: exportedDestinations,
        activity
      }, selection, now());
      if (!result) {
        setModalProblem({
          happened: 'Nothing is selected for export.',
          meaning: 'No download was requested.',
          next: 'Select the collections you want to include.'
        });
        return;
      }
      requestDownload(result.filename, result.text);
      record(`Unencrypted workspace download requested: ${result.filename}.`);
      setNotice(`Download requested: ${result.filename}. This preview cannot confirm that the file was saved.`);
      setModalProblem(null);
    } catch {
      setModalProblem({
        happened: 'The export could not be requested.',
        meaning: 'Your workspace is unchanged and no saved copy is confirmed.',
        next: 'Try again. If your browser blocks downloads, allow this download or copy the text you need.'
      });
    }
  }
  function exportLayout() {
    try {
      const filename = 'EcDys-layout.json';
      requestDownload(filename, JSON.stringify({
        schema: 'EcDys.layout.plaintext',
        version: 1,
        exportedAt: now(),
        layout
      }, null, 2) + '\n');
      record('Unencrypted layout download requested.');
      setNotice('Layout download requested. This preview cannot confirm that the file was saved.');
    } catch {
      setProblem({
        happened: 'The layout download could not be requested.',
        meaning: 'Your layout is unchanged and no file is confirmed.',
        next: 'Try again or check your browser download settings.'
      });
    }
  }
  function clearWorkspace() {
    dispatch({
      type: 'clear',
      at: now(),
      eventId: id()
    });
    setOpeningRequests({});
    setBookmarkTitle('');
    setBookmarkUrl('');
    setCommand('');
    noteDirty.current = null;
    setModalProblem(null);
    setRoute('start');
    setActiveNoteId('');
    setActiveDestinationId('');
    setAddress('');
    setModal(null);
    setProblem(null);
    setNotice('Workspace data and undo history were removed from this preview. Exported files are unchanged.');
  }
  const commands = [...(['start', 'notes', 'bookmarks', 'activity', 'layout', 'capabilities'] as Route[]).map(r => ({
    id: r,
    label: routeLabels[r],
    detail: 'In this preview',
    action: () => {
      navigate(r);
      setModal(null);
    }
  })), ...destinations.map(d => ({
    id: d.id,
    label: d.recipient,
    detail: 'Prepared destination',
    action: () => {
      setActiveDestinationId(d.id);
      navigate('destination');
      setModal(null);
    }
  }))].filter(c => `${c.label} ${c.detail}`.toLowerCase().includes(command.toLowerCase())).slice(0, 8);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (modal && dialog && !dialog.open) dialog.showModal();
    if (!modal && dialog?.open) dialog.close();
    if (modal === 'command') requestAnimationFrame(() => commandRef.current?.focus());
  }, [modal]);
  useEffect(() => {
    setCommandIndex(0);
  }, [command]);
  useEffect(() => {
    if (route === 'destination' && !activeDestination) setRoute('start');
  }, [route, activeDestination]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        setCommand('');
        setCommandIndex(0);
        setModal('command');
      }
      if ((event.ctrlKey || event.metaKey) && key === 'l') {
        event.preventDefault();
        dialogRef.current?.close();
        setModal(null);
        requestAnimationFrame(() => {
          addressRef.current?.focus();
          addressRef.current?.select();
        });
      }
      const tag = (event.target as HTMLElement)?.tagName;
      if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey && !dialogRef.current?.open && tag !== 'INPUT' && tag !== 'TEXTAREA' && !(event.target as HTMLElement)?.isContentEditable) {
        event.preventDefault();
        if (historyAvailable.current) dispatch({
          type: 'undo',
          at: now(),
          eventId: id()
        });
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);
  function navItem(target: Route, icon: IconName, count?: number) {
    return <button className={`dx-nav-item ${route === target ? 'is-active' : ''}`} onClick={() => navigate(target)} aria-current={route === target ? 'page' : undefined}><Icon name={icon} size={17} /><span>{routeLabels[target]}</span>{count !== undefined && <span className="dx-nav-count dx-mono">{count}</span>}</button>;
  }
  function field(label: string, value: ReactNode, detail?: string) {
    return <div className="dx-context-row"><dt>{label}</dt><dd className="dx-mono">{value}</dd>{detail && <p>{detail}</p>}</div>;
  }
  const rootClass = `ecdys-doctrine ${!layout.showSidebar ? 'dx-hide-sidebar' : ''} ${!layout.showContext ? 'dx-hide-context' : ''} ${layout.contextDock === 'bottom' ? 'dx-context-bottom' : ''} ${navVisible ? 'dx-nav-visible' : ''} ${contextVisible ? 'dx-context-visible' : ''}`;
  const exportRows: Array<{
    key: keyof ExportSelection;
    label: string;
    detail: string;
    count: number;
  }> = [{
    key: 'notes',
    label: 'Notes',
    detail: 'Titles, text, identifiers and edit times.',
    count: notes.length
  }, {
    key: 'bookmarks',
    label: 'Bookmarks',
    detail: 'Titles, full URLs and creation times.',
    count: bookmarks.length
  }, {
    key: 'destinations',
    label: 'Prepared destinations',
    detail: 'Full URLs, search queries and request times.',
    count: destinations.length
  }, {
    key: 'activity',
    label: 'Activity',
    detail: 'Recorded actions, addresses and timestamps.',
    count: activity.length
  }];
  return <div className={rootClass} data-theme={layout.theme} data-density={layout.density} style={{
    '--dx-sidebar-width': `${layout.sidebarWidth}px`,
    '--dx-context-width': `${layout.contextWidth}px`
  } as CSSProperties}>
    <div className="dx-shell">
      <aside className="dx-sidebar" aria-label="Workspace navigation">
        <div className="dx-brand"><span>EcDys</span><span className="dx-mono">PREVIEW</span></div>
        <div className="dx-workspace-label"><Status active={true}>Workspace</Status><span className="dx-mono">In page memory</span></div>
        <nav className="dx-nav" aria-label="Local views">{navItem('start', 'start')}{navItem('notes', 'note', notes.length)}{navItem('bookmarks', 'bookmark', bookmarks.length)}{navItem('activity', 'activity', activity.length)}</nav>
        <div className="dx-side-heading"><span>Prepared destinations</span><span className="dx-mono">{destinations.length}</span></div>
        <div className="dx-dest-list">{destinations.length === 0 ? <p className="dx-help">No destinations prepared.</p> : destinations.map(destination => <div key={destination.id} className={`dx-dest-row ${route === 'destination' && activeDestinationId === destination.id ? 'is-active' : ''}`}><button className="dx-dest-pick" onClick={() => {
              setActiveDestinationId(destination.id);
              navigate('destination');
            }}><span className="dx-status-dot" data-active={!!openingRequests[destination.id]} aria-hidden="true" /><span className="dx-mono">{destination.recipient}</span></button><button className="dx-close" title={`Remove ${destination.recipient}; undo available`} aria-label={`Remove prepared destination ${destination.recipient}; undo available`} onClick={() => closeDestination(destination.id)}><Icon name="close" size={16} /></button></div>)}</div>
        <div className="dx-sidebar-bottom">{navItem('layout', 'layout')}{navItem('capabilities', 'info')}<button className="dx-inline-action" onClick={() => openModal('command')}><Icon name="search" size={16} /><span>Quick switch</span><kbd>Ctrl K</kbd></button></div>
      </aside>
      <div className="dx-main">
        <header className="dx-toolbar">
          <button className="dx-toolbar-button dx-navigation-button" onClick={() => {
            if (window.matchMedia('(max-width: 760px)').matches) setNavVisible(v => !v);else updateLayout({
              showSidebar: !layout.showSidebar
            }, layout.showSidebar ? 'Hide navigation' : 'Show navigation');
          }} aria-expanded={window.innerWidth <= 760 ? navVisible : layout.showSidebar}><Icon name="menu" size={17} /><span>Navigation</span></button>
          <form className="dx-address-form" onSubmit={event => {
            event.preventDefault();
            stage(address);
          }}><Icon name="search" size={17} /><label className="dx-sr-only" htmlFor="dx-address">Address or search query</label><input ref={addressRef} id="dx-address" placeholder="Address or search query" value={address} onChange={event => setAddress(event.target.value)} autoComplete="off" spellCheck={false} /><button type="submit">Prepare<Icon name="arrow" size={15} /></button></form>
          <button className="dx-toolbar-button" onClick={() => openModal('export')}><Icon name="export" size={17} /><span>Export</span></button>
          <button className="dx-toolbar-button" onClick={() => {
            if (window.matchMedia('(max-width: 1100px)').matches) setContextVisible(v => !v);else updateLayout({
              showContext: !layout.showContext
            }, layout.showContext ? 'Hide context panel' : 'Show context panel');
          }} aria-expanded={window.innerWidth <= 1100 ? contextVisible : layout.showContext}><Icon name="panel" size={17} /><span>Context</span></button>
        </header>
        <div className="dx-body">
          <main className="dx-content" id="dx-main-content">
            <div className="dx-page">
              <div className="dx-page-heading"><span className="dx-eyebrow">WORKSPACE / {routeLabels[route].toUpperCase()}</span><Status active={true}>In this preview</Status></div>
              <ErrorMessage problem={problem} />
              {notice && <div className="dx-notice" role="status"><p>{notice}</p><button className="dx-inline-action" onClick={() => setNotice('')}>Dismiss</button></div>}
              {route === 'start' && <>
                <h1>Start</h1><p className="dx-intro">Choose a local action. Review before leaving.</p>
                <div className="dx-start-paths">
                  <button className="dx-path-row" onClick={() => addressRef.current?.focus()}><span className="dx-path-number dx-mono">01</span><span className="dx-path-copy"><strong>Prepare a destination</strong><span>Review an address or search before opening it.</span></span><Icon name="arrow" size={18} /></button>
                  <button className="dx-path-row" onClick={addNote}><span className="dx-path-number dx-mono">02</span><span className="dx-path-copy"><strong>Create a note</strong><span>Write in this page’s memory. Export to keep a copy.</span></span><Icon name="arrow" size={18} /></button>
                  <button className="dx-path-row" onClick={openBookmarkForm}><span className="dx-path-number dx-mono">03</span><span className="dx-path-copy"><strong>Add a bookmark</strong><span>Keep an address for this preview session.</span></span><Icon name="arrow" size={18} /></button>
                </div>
                <div className="dx-example"><div><span className="dx-eyebrow">WORKING EXAMPLE</span><span className="dx-mono">https://example.com</span></div><button className="dx-inline-action" onClick={() => stage('https://example.com')}>Prepare example<Icon name="arrow" size={15} /></button></div>
                <p className="dx-help dx-retention-line">Preparing a destination does not open it. Reloading resets this workspace.</p>
              </>}
              {route === 'destination' && activeDestination && <section className="dx-destination">
                <h1>Destination prepared</h1><p className="dx-intro">Review the address and the boundary it will cross.</p>
                <Status active={!!activeRequestAt}>{activeRequestAt ? 'Opening requested; completion not observed' : 'No opening request recorded'}</Status>
                <div className="dx-url-display dx-mono">{activeDestination.url}</div>
                <dl className="dx-data-list"><div><dt>Destination host</dt><dd className="dx-mono">{activeDestination.recipient}</dd></div><div><dt>Address type</dt><dd className="dx-mono">{activeDestination.kind === 'search' ? 'Search query / DuckDuckGo' : 'Website address'}</dd></div><div><dt>Protocol requested</dt><dd className="dx-mono">{activeDestination.scheme.toUpperCase()}</dd></div><div><dt>Prepared</dt><dd className="dx-mono">{time(activeDestination.preparedAt)}</dd></div>{activeRequestAt && <div><dt>Opening requested</dt><dd className="dx-mono">{time(activeRequestAt)}</dd></div>}</dl>
                {activeDestination.kind === 'search' && <div className="dx-query-detail"><span>Query handed to the browser</span><p className="dx-mono">{activeDestination.payload}</p></div>}
                {activeDestination.scheme === 'http' && <div className="dx-alert"><strong>HTTP requested.</strong><p>This address does not request an encrypted HTTPS connection. Edit the address if that is not intended.</p></div>}
                <div className="dx-boundary-action"><div><span className="dx-eyebrow">LEAVES THIS PREVIEW</span><p>Opens <strong className="dx-mono">{activeDestination.recipient}</strong> using your current browser and its network settings.</p><p className="dx-help">The address or query is handed to your browser. This preview does not inspect its route, isolation, cookies or response.</p></div><a className="dx-button dx-primary" href={activeDestination.url} target="_blank" rel="noopener noreferrer" onClick={recordExternalRequest} onAuxClick={event => {
                    if (event.button === 1) recordExternalRequest();
                  }}>Open in your browser<Icon name="external" size={16} /></a></div>
                <div className="dx-local-actions"><button className="dx-button dx-secondary" onClick={() => {
                    setBookmarkUrl(activeDestination.url);
                    setBookmarkTitle(activeDestination.recipient);
                    openModal('bookmark');
                  }}><Icon name="bookmark" size={16} />Add bookmark</button><button className="dx-inline-action" onClick={() => {
                    setAddress(activeDestination.url);
                    addressRef.current?.focus();
                    addressRef.current?.select();
                  }}>Edit address</button></div>
              </section>}
              {route === 'notes' && <>
                <div className="dx-title-actions"><h1>Notes</h1><button className="dx-button dx-secondary" onClick={addNote}><Icon name="plus" size={16} />Create note</button></div><p className="dx-intro">Text is held in this page’s memory. Export before reloading.</p>
                {notes.length ? <div className="dx-split-editor"><div className="dx-note-list" aria-label="Notes">{notes.map(note => <button className={`dx-note-item ${activeNote?.id === note.id ? 'is-active' : ''}`} key={note.id} onClick={() => setActiveNoteId(note.id)}><strong>{note.title || 'Untitled note'}</strong><span className="dx-mono">{note.updatedAt.slice(11, 19)} UTC</span></button>)}</div>{activeNote && <div className="dx-note-editor"><label className="dx-sr-only" htmlFor="dx-note-title">Note title</label><input className="dx-note-title" id="dx-note-title" value={activeNote.title} onChange={event => editNote('title', event.target.value)} onBlur={finishNoteEdit} placeholder="Note title" /><label className="dx-sr-only" htmlFor="dx-note-body">Note text</label><textarea className="dx-textarea" id="dx-note-body" value={activeNote.body} onChange={event => editNote('body', event.target.value)} onBlur={finishNoteEdit} placeholder="Write a note." spellCheck={false} /><div className="dx-note-meta"><span className="dx-mono">Edited {time(activeNote.updatedAt)}</span><button className="dx-inline-action" onClick={() => removeNote(activeNote.id)}><Icon name="trash" size={16} />Remove note</button></div><p className="dx-help">Undo retains up to 30 recent changes, including note removal. Reloading or clearing removes undo history.</p></div>}</div> : <div className="dx-empty"><strong>No notes in this workspace.</strong><p>Create a note to begin. No file will be saved automatically.</p><button className="dx-button dx-secondary" onClick={addNote}>Create note<Icon name="plus" size={16} /></button></div>}
              </>}
              {route === 'bookmarks' && <>
                <div className="dx-title-actions"><h1>Bookmarks</h1><button className="dx-button dx-secondary" onClick={openBookmarkForm}><Icon name="plus" size={16} />Add bookmark</button></div><p className="dx-intro">Addresses in this workspace. Selecting one prepares it for review.</p>
                {bookmarks.length ? <div className="dx-bookmarks-list">{bookmarks.map(bookmark => <div className="dx-bookmark-row" key={bookmark.id}><button className="dx-bookmark-pick" onClick={() => stage(bookmark.url)}><strong>{bookmark.title}</strong><span className="dx-mono">{bookmark.url}</span></button><button className="dx-inline-action" onClick={() => stage(bookmark.url)}>Prepare<Icon name="arrow" size={15} /></button><button className="dx-inline-action" onClick={() => removeBookmark(bookmark.id)}><Icon name="trash" size={16} />Remove</button></div>)}</div> : <div className="dx-empty"><strong>No bookmarks in this workspace.</strong><p>Add an address. It will remain here until the workspace is reloaded or cleared.</p><button className="dx-button dx-secondary" onClick={openBookmarkForm}>Add bookmark<Icon name="plus" size={16} /></button></div>}
                <p className="dx-help">Undo retains up to 30 recent changes, including bookmark removal. Reloading or clearing removes undo history.</p>
              </>}
              {route === 'activity' && <>
                <h1>Activity</h1><p className="dx-intro">Source: actions performed in this preview. Times are UTC.</p><div className="dx-activity-list">{[...activity].reverse().map(entry => <div className="dx-activity-row" key={entry.id}><time className="dx-mono" dateTime={entry.at}>{time(entry.at)}</time><p>{entry.message}</p></div>)}</div><p className="dx-help">This is a session record in memory. It is not a tamper-evident audit log and does not observe external browsing.</p>
              </>}
              {route === 'layout' && <>
                <h1>Layout</h1><p className="dx-intro">Changes apply to this preview and can be undone.</p>
                <section className="dx-layout-section"><h2>Appearance</h2><div className="dx-field"><span>Theme</span><div className="dx-choice-group"><button className="dx-choice" aria-pressed={layout.theme === 'dark'} onClick={() => updateLayout({
                        theme: 'dark'
                      }, 'Use dark mode')}>Dark</button><button className="dx-choice" aria-pressed={layout.theme === 'light'} onClick={() => updateLayout({
                        theme: 'light'
                      }, 'Use light mode')}>Light</button></div></div><div className="dx-field"><span>Panel density</span><div className="dx-choice-group"><button className="dx-choice" aria-pressed={layout.density === 'normal'} onClick={() => updateLayout({
                        density: 'normal'
                      }, 'Use normal density')}>Normal</button><button className="dx-choice" aria-pressed={layout.density === 'compact'} onClick={() => updateLayout({
                        density: 'compact'
                      }, 'Use compact density')}>Compact</button></div></div></section>
                <section className="dx-layout-section"><h2>Panels</h2><div className="dx-field"><span>Context panel</span><div className="dx-choice-group"><button className="dx-choice" aria-pressed={layout.showContext} onClick={() => updateLayout({
                        showContext: true
                      }, 'Show context panel')}>Shown</button><button className="dx-choice" aria-pressed={!layout.showContext} onClick={() => updateLayout({
                        showContext: false
                      }, 'Hide context panel')}>Hidden</button></div></div><div className="dx-field"><span>Context position</span><div className="dx-choice-group"><button className="dx-choice" aria-pressed={layout.contextDock === 'right'} onClick={() => updateLayout({
                        contextDock: 'right'
                      }, 'Dock context right')}>Right</button><button className="dx-choice" aria-pressed={layout.contextDock === 'bottom'} onClick={() => updateLayout({
                        contextDock: 'bottom'
                      }, 'Dock context below')}>Below</button></div></div><label className="dx-field dx-range"><span>Navigation width <span className="dx-mono">{layout.sidebarWidth} px</span></span><input type="range" min="180" max="280" step="4" value={layout.sidebarWidth} onChange={event => updateLayout({
                      sidebarWidth: Number(event.target.value)
                    }, 'Resize navigation', 'resize-navigation')} /></label><label className="dx-field dx-range"><span>Context width <span className="dx-mono">{layout.contextWidth} px</span></span><input type="range" min="240" max="360" step="4" value={layout.contextWidth} onChange={event => updateLayout({
                      contextWidth: Number(event.target.value)
                    }, 'Resize context', 'resize-context')} /></label></section>
                <div className="dx-local-actions"><button className="dx-button dx-secondary" onClick={exportLayout}><Icon name="export" size={16} />Export layout</button><button className="dx-inline-action" onClick={() => change({
                    ...content,
                    layout: {
                      ...defaultLayout
                    }
                  }, 'Reset layout', 'Layout reset to defaults.')}>Reset layout</button></div><p className="dx-help">Layout export is unencrypted JSON. It contains these layout preferences only. Layout import and automatic recovery are not implemented.</p><p className="dx-help">State changes are immediate. There are no looping or transitional animations.</p>
              </>}
              {route === 'capabilities' && <>
                <h1>Capabilities</h1><p className="dx-intro">What this preview implements, and what it cannot claim.</p>
                <dl className="dx-capability-table"><div><dt>Notes and bookmarks</dt><dd>Held in this page’s memory</dd></div><div><dt>Destination preparation</dt><dd>Validates and displays HTTP / HTTPS addresses</dd></div><div><dt>External browsing</dt><dd>Delegated to your current browser</dd></div><div><dt>Workspace export</dt><dd>Selected data as unencrypted JSON</dd></div><div><dt>Undo</dt><dd>Up to 30 recent workspace changes</dd></div><div><dt>Persistent sessions</dt><dd>Not implemented</dd></div><div><dt>Vault / encryption at rest</dt><dd>Not implemented</dd></div><div><dt>EcDys sandbox</dt><dd>Not provided</dd></div><div><dt>Network route / Tor</dt><dd>Not inspected or configured here</dd></div><div><dt>Host and browser observation</dt><dd>Not determined by this preview</dd></div></dl>
                <p className="dx-help">The preview runs in a hosted page. Its own workspace uses page memory; this does not establish what the host, browser or extensions may observe.</p>
                <section className="dx-layout-section"><h2>Clear preview data</h2><p className="dx-help">Remove notes, bookmarks, prepared destinations, the existing activity record and undo history from this preview. Exported files are unaffected.</p><button className="dx-button dx-secondary" onClick={() => openModal('clear')}><Icon name="trash" size={16} />Review data removal</button></section>
              </>}
            </div>
          </main>
          <aside className="dx-context" aria-label="Context and boundaries">
            <header className="dx-context-header"><h2>Context</h2><button className="dx-inline-action dx-context-close" onClick={() => setContextVisible(false)}>Close</button></header>
            <dl className="dx-context-list">{field('Execution', 'Browser preview')}{field('Workspace', 'In page memory', 'Reset on reload.')}{field('Vault', <Status active={false}>Not implemented</Status>)}{field('Sandbox', 'Not provided')}{route === 'destination' && activeDestination ? <>{field('Destination', activeDestination.recipient)}{field('Opening', activeRequestAt ? 'Requested; not observed' : 'No opening request recorded')}{field('Network route', 'Not inspected')}</> : field('Network route', 'Not inspected')}</dl>
            <div className="dx-context-note"><span className="dx-eyebrow">RETENTION</span><p>Export before leaving. No automatic recovery.</p><button className="dx-inline-action" onClick={() => openModal('export')}>Export workspace<Icon name="export" size={15} /></button></div>
            <button className="dx-inline-action dx-capabilities-link" onClick={() => navigate('capabilities')}>View capabilities<Icon name="arrow" size={15} /></button>
          </aside>
        </div>
        <footer className="dx-statusbar"><Status active={true}>In-memory workspace</Status><Status active={false}>Vault not implemented</Status><button className="dx-inline-action dx-undo" disabled={!history.length} onClick={undo} title={recentAction ? `Undo: ${recentAction}` : 'No workspace change to undo'}><Icon name="undo" size={15} /><span>{recentAction ? `Undo: ${recentAction}` : 'Undo'}</span></button></footer>
      </div>
    </div>
    <dialog ref={dialogRef} className={`dx-dialog ${modal === 'command' ? 'dx-command-dialog' : ''}`} aria-label={modal === 'export' ? 'Export workspace' : modal === 'bookmark' ? 'Add bookmark' : modal === 'clear' ? 'Clear preview data' : 'Quick switch'} onCancel={event => {
      event.preventDefault();
      setModal(null);
    }} onClick={event => {
      if (event.target === event.currentTarget) setModal(null);
    }}>
      <div className="dx-dialog-inner">
        <div className="dx-dialog-header"><h2>{modal === 'export' ? 'Export workspace' : modal === 'bookmark' ? 'Add bookmark' : modal === 'clear' ? 'Clear preview data' : 'Quick switch'}</h2><button className="dx-inline-action" onClick={() => setModal(null)}>Close<Icon name="close" size={16} /></button></div>
        <ErrorMessage problem={modalProblem} />
        {modal === 'export' && <><p className="dx-intro">Choose what leaves this page as a downloaded file.</p><div className="dx-alert"><strong>Unencrypted JSON.</strong><p>Anyone with access to the downloaded file can read the selected content.</p></div><div className="dx-export-options">{exportRows.map(row => <label className="dx-export-option" key={row.key}><input type="checkbox" checked={selection[row.key]} onChange={event => setSelection(value => ({
                ...value,
                [row.key]: event.target.checked
              }))} /><span><strong>{row.label} <span className="dx-mono">({row.count})</span></strong><small>{row.detail}</small></span></label>)}</div><p className="dx-help">Selection starts empty. Export does not remove anything from this workspace. This action requests a browser download; it does not upload to another service.</p>{notice && <p className="dx-notice" role="status">{notice}</p>}<div className="dx-dialog-actions"><button className="dx-button dx-secondary" onClick={() => setModal(null)}>Cancel</button><button className="dx-button dx-secondary" onClick={exportWorkspace} disabled={!Object.values(selection).some(Boolean)}><Icon name="export" size={16} />Download selected data</button></div></>}
        {modal === 'bookmark' && <form onSubmit={addBookmark}><p className="dx-intro">Stored in this page’s memory until reload or clearing.</p><label className="dx-field dx-form-field"><span>Title <span className="dx-help">optional</span></span><input value={bookmarkTitle} onChange={event => setBookmarkTitle(event.target.value)} placeholder="Use the destination host if empty" /></label><label className="dx-field dx-form-field"><span>Website address</span><input className="dx-mono" value={bookmarkUrl} onChange={event => setBookmarkUrl(event.target.value)} placeholder="https://example.com" autoComplete="off" spellCheck={false} /></label><p className="dx-help">Adding a bookmark does not open the website. Export bookmarks to keep a copy.</p><div className="dx-dialog-actions"><button type="button" className="dx-button dx-secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="dx-button dx-secondary">Add bookmark<Icon name="plus" size={16} /></button></div></form>}
        {modal === 'clear' && <><p className="dx-intro">These items will be removed from this preview:</p><dl className="dx-confirm-counts"><div><dt>Notes</dt><dd className="dx-mono">{notes.length}</dd></div><div><dt>Bookmarks</dt><dd className="dx-mono">{bookmarks.length}</dd></div><div><dt>Prepared destinations</dt><dd className="dx-mono">{destinations.length}</dd></div><div><dt>Existing activity entries</dt><dd className="dx-mono">{activity.length}</dd></div><div><dt>Undo snapshots</dt><dd className="dx-mono">{history.length}</dd></div></dl><div className="dx-alert"><strong>Cannot be undone here.</strong><p>Exported files and layout preferences are unaffected. This removes preview state; it does not erase browser or host records. Input drafts will also be cleared. A new activity entry will record the clearing action.</p></div><div className="dx-dialog-actions"><button className="dx-button dx-secondary" onClick={() => setModal(null)}>Keep workspace</button><button className="dx-button dx-danger" onClick={clearWorkspace}>Clear preview data<Icon name="trash" size={16} /></button></div></>}
        {modal === 'command' && <><form className="dx-command-input" onSubmit={event => {
            event.preventDefault();
            commands[commandIndex]?.action();
          }}><Icon name="search" size={18} /><input ref={commandRef} value={command} placeholder="Find a view or prepared destination" aria-label="Quick switch search" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="dx-command-list" aria-activedescendant={commands.length ? `dx-command-${commandIndex}` : undefined} onChange={event => setCommand(event.target.value)} onKeyDown={event => {
              if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && commands.length) {
                event.preventDefault();
                setCommandIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length);
              }
            }} /><kbd>Ctrl K</kbd></form><div className="dx-command-results" id="dx-command-list" role="listbox" aria-label="Matching views">{commands.map((commandItem, index) => <button className={index === commandIndex ? 'is-selected' : ''} id={`dx-command-${index}`} role="option" aria-selected={index === commandIndex} key={commandItem.id} onMouseEnter={() => setCommandIndex(index)} onClick={commandItem.action}><span>{commandItem.label}</span><span className="dx-mono">{commandItem.detail}</span><Icon name="arrow" size={15} /></button>)}</div>{!commands.length && <p className="dx-help">No matching view. Try another name.</p>}<p className="dx-help">↑ ↓ Select. Enter opens the selected view. Escape closes this dialog.</p></>}
      </div>
    </dialog>
  </div>;
};
