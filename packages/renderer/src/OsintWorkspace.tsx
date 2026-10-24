import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from 'solid-js';
import {
  MindNodeSchema,
  ResearchDraftSchema,
  ResearchToolSchema,
  researchKinds,
  toolCategories,
  type EcdysApi,
  type MindNode,
  type ResearchDraft,
  type ResearchTool,
  type TemporaryBrowserSession,
} from '@ecdys/shared';
import {Modal} from './Modal';
import {EncryptedNotepad} from './EncryptedNotepad';
import {ResearchSaveQueue, type ResearchSaveState} from './research-save';
import './osint.css';

const NODE_WIDTH = 200,
  NODE_HEIGHT = 100;
const kindNames: Record<MindNode['kind'], string> = {
  topic: 'Topic',
  person: 'Person',
  organization: 'Organization',
  domain: 'Domain',
  address: 'Address',
  note: 'Note',
};
const kindMarks: Record<MindNode['kind'], string> = {
  topic: '◎',
  person: 'P',
  organization: 'O',
  domain: 'D',
  address: '#',
  note: '≡',
};
const blankTool = (): ResearchTool => ({
  id: crypto.randomUUID(),
  name: '',
  category: 'Custom',
  description: '',
  url: '',
  pinned: false,
});
const clamp = (value: number) => Math.max(-10000, Math.min(10000, Math.round(value)));

export function OsintWorkspace(props: {
  api: EcdysApi;
  active: boolean;
  session: TemporaryBrowserSession | null;
  openBrowser: () => void;
  registerFlush: (flush?: () => Promise<void>) => void;
}) {
  const [tab, setTab] = createSignal<'map' | 'tools'>('map');
  const [draft, setDraft] = createSignal<ResearchDraft>();
  const [selectedId, setSelectedId] = createSignal('');
  const selected = createMemo(() => draft()?.nodes.find((node) => node.id === selectedId()));
  const [saveState, setSaveState] = createSignal<ResearchSaveState>({state: 'saved'});
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [opening, setOpening] = createSignal(false);
  const [history, setHistory] = createSignal<ResearchDraft[]>([]);
  const [toolEditor, setToolEditor] = createSignal<ResearchTool>();
  const [toolError, setToolError] = createSignal('');
  const [removing, setRemoving] = createSignal<{kind: 'node' | 'tool'; id: string; name: string}>();
  const [reload, setReload] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [category, setCategory] = createSignal('All');
  const [linkTarget, setLinkTarget] = createSignal(''),
    [linkLabel, setLinkLabel] = createSignal('');
  const [camera, setCamera] = createSignal({x: 60, y: 60, scale: 1});
  const [dimensions, setDimensions] = createSignal({width: 800, height: 600});
  const [dragPosition, setDragPosition] = createSignal<{id: string; x: number; y: number}>();
  let stage: HTMLDivElement | undefined, titleInput: HTMLInputElement | undefined;
  let saver: ResearchSaveQueue | undefined,
    disposed = false,
    fitted = false;
  let flushNotepad: (() => Promise<void>) | undefined;
  let gesture:
    | {
        pointer: number;
        startX: number;
        startY: number;
        x: number;
        y: number;
        nodeId?: string;
        moved: boolean;
      }
    | undefined;
  const tools = createMemo(() =>
    (draft()?.tools || [])
      .filter(
        (tool) =>
          (category() === 'All' || tool.category === category()) &&
          [tool.name, tool.description, tool.url, tool.category]
            .join(' ')
            .toLowerCase()
            .includes(query().toLowerCase()),
      )
      .toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name)),
  );
  const links = createMemo(
    () =>
      draft()?.edges.filter(
        (edge) => edge.source === selectedId() || edge.target === selectedId(),
      ) || [],
  );
  const targets = createMemo(
    () =>
      draft()?.nodes.filter(
        (node) =>
          node.id !== selectedId() &&
          !links().some((edge) => edge.source === node.id || edge.target === node.id),
      ) || [],
  );

  async function load() {
    setLoading(true);
    setError('');
    try {
      const workspace = await props.api.researchWorkspace();
      if (disposed) return;
      saver?.dispose();
      const {revision, updatedAt: _updatedAt, ...document} = workspace;
      setDraft(document);
      setSelectedId(document.nodes[0]?.id || '');
      setHistory([]);
      setSaveState({state: 'saved'});
      saver = new ResearchSaveQueue(
        revision,
        (input) => props.api.saveResearchWorkspace(input),
        setSaveState,
      );
      fitted = false;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Research could not be opened.');
    } finally {
      if (!disposed) setLoading(false);
    }
  }
  onMount(() => {
    props.registerFlush(async () => {
      await saver?.flush();
      await flushNotepad?.();
    });
    void load();
  });
  onCleanup(() => {
    disposed = true;
    saver?.dispose();
    props.registerFlush();
  });
  function change(update: (document: ResearchDraft) => ResearchDraft, remember = true) {
    const previous = draft();
    if (!previous) return;
    const parsed = ResearchDraftSchema.safeParse(update(previous));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check the research settings.');
      return;
    }
    if (remember) setHistory((entries) => [...entries.slice(-19), previous]);
    setDraft(parsed.data);
    setError('');
    saver?.update(parsed.data);
  }
  function patchNode(patch: Partial<MindNode>, remember = true) {
    change(
      (document) => ({
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === selectedId() ? {...node, ...patch} : node,
        ),
      }),
      remember,
    );
  }
  function position(node: MindNode) {
    const drag = dragPosition();
    return drag?.id === node.id ? drag : node;
  }
  function fit() {
    const nodes = draft()?.nodes || [],
      size = dimensions();
    if (!nodes.length) {
      setCamera({x: 60, y: 60, scale: 1});
      return;
    }
    const minX = Math.min(...nodes.map((node) => node.x)),
      minY = Math.min(...nodes.map((node) => node.y));
    const width = Math.max(...nodes.map((node) => node.x)) - minX + NODE_WIDTH;
    const height = Math.max(...nodes.map((node) => node.y)) - minY + NODE_HEIGHT;
    const scale = Math.max(
      0.25,
      Math.min(1, (size.width - 100) / width, (size.height - 100) / height),
    );
    setCamera({
      scale,
      x: (size.width - width * scale) / 2 - minX * scale,
      y: (size.height - height * scale) / 2 - minY * scale,
    });
  }
  function observeStage(element: HTMLDivElement) {
    stage = element;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width < 1) return;
      setDimensions({width: entry.contentRect.width, height: entry.contentRect.height});
      if (!fitted && draft()) {
        fit();
        fitted = true;
      }
    });
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  }
  createEffect(() => {
    if (props.active && tab() === 'map' && !loading() && !fitted && stage?.clientWidth) {
      fit();
      fitted = true;
    }
  });
  function zoom(factor: number) {
    const size = dimensions(),
      current = camera(),
      scale = Math.max(0.25, Math.min(1.8, current.scale * factor));
    setCamera({
      scale,
      x: size.width / 2 - ((size.width / 2 - current.x) * scale) / current.scale,
      y: size.height / 2 - ((size.height / 2 - current.y) * scale) / current.scale,
    });
  }
  function tabKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'map'
        : event.key === 'End'
          ? 'tools'
          : tab() === 'map'
            ? 'tools'
            : 'map';
    setTab(next);
    document.getElementById(next === 'map' ? 'research-map-tab' : 'research-tools-tab')?.focus();
  }
  function begin(event: PointerEvent, node?: MindNode) {
    if (event.button !== 0 || !stage) return;
    if (!node && (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    if (node) {
      setSelectedId(node.id);
      setLinkTarget('');
    }
    const origin = node || camera();
    gesture = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: origin.x,
      y: origin.y,
      nodeId: node?.id,
      moved: false,
    };
    stage.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.startX,
      dy = event.clientY - gesture.startY;
    gesture.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    if (!gesture.moved) return;
    if (gesture.nodeId)
      setDragPosition({
        id: gesture.nodeId,
        x: clamp(gesture.x + dx / camera().scale),
        y: clamp(gesture.y + dy / camera().scale),
      });
    else setCamera((current) => ({...current, x: gesture!.x + dx, y: gesture!.y + dy}));
  }
  function end(event: PointerEvent, cancel = false) {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const drag = dragPosition();
    if (!cancel && gesture.nodeId && drag) {
      const id = gesture.nodeId;
      change((document) => ({
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === id ? {...node, x: drag.x, y: drag.y} : node,
        ),
      }));
    }
    gesture = undefined;
    setDragPosition();
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }
  function addNode() {
    const parent = selected(),
      current = camera(),
      size = dimensions();
    const childCount = parent
      ? draft()!.edges.filter((edge) => edge.source === parent.id).length
      : 0;
    const node: MindNode = {
      id: crypto.randomUUID(),
      title: draft()?.nodes.length ? 'New topic' : 'Research focus',
      kind: 'topic',
      note: '',
      sourceUrl: '',
      x: clamp(
        parent ? parent.x + 290 : (size.width / 2 - current.x) / current.scale - NODE_WIDTH / 2,
      ),
      y: clamp(
        parent
          ? parent.y + childCount * 140
          : (size.height / 2 - current.y) / current.scale - NODE_HEIGHT / 2,
      ),
    };
    change((document) => ({
      ...document,
      nodes: [...document.nodes, node],
      edges: parent
        ? [
            ...document.edges,
            {id: crypto.randomUUID(), source: parent.id, target: node.id, label: ''},
          ]
        : document.edges,
    }));
    if (draft()?.nodes.some((entry) => entry.id === node.id)) {
      setSelectedId(node.id);
      setLinkTarget('');
      queueMicrotask(() => {
        titleInput?.focus({preventScroll: true});
        titleInput?.select();
      });
    }
  }
  function connectNodes() {
    if (!selected() || !linkTarget()) return;
    change((document) => ({
      ...document,
      edges: [
        ...document.edges,
        {id: crypto.randomUUID(), source: selectedId(), target: linkTarget(), label: linkLabel()},
      ],
    }));
    setLinkTarget('');
    setLinkLabel('');
  }
  async function openUrl(url: string) {
    const session = props.session;
    if (!session || session.status !== 'active') {
      props.openBrowser();
      return;
    }
    setOpening(true);
    setError('');
    try {
      await props.api.navigateBrowser(session.id, url);
      props.openBrowser();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The tool could not be opened.');
    } finally {
      setOpening(false);
    }
  }
  function saveTool(event: SubmitEvent) {
    event.preventDefault();
    const result = ResearchToolSchema.safeParse(toolEditor());
    if (!result.success) {
      setToolError(result.error.issues[0]?.message || 'Check the tool fields.');
      return;
    }
    const existing = draft()!.tools.some((tool) => tool.id === result.data.id);
    const next = {
      ...draft()!,
      tools: existing
        ? draft()!.tools.map((tool) => (tool.id === result.data.id ? result.data : tool))
        : [...draft()!.tools, result.data],
    };
    const parsed = ResearchDraftSchema.safeParse(next);
    if (!parsed.success) {
      setToolError(parsed.error.issues[0]?.message || 'The tool library is full.');
      return;
    }
    change(() => parsed.data);
    setToolEditor();
  }
  function remove() {
    const item = removing();
    if (!item) return;
    change((document) =>
      item.kind === 'tool'
        ? {...document, tools: document.tools.filter((tool) => tool.id !== item.id)}
        : {
            ...document,
            nodes: document.nodes.filter((node) => node.id !== item.id),
            edges: document.edges.filter(
              (edge) => edge.source !== item.id && edge.target !== item.id,
            ),
          },
    );
    if (item.kind === 'node') setSelectedId('');
    setRemoving();
  }

  return (
    <section class="osint-workspace" aria-label="OSINT workspace">
      <Show when={error()}>
        <div class="message error" role="alert">
          {error()}{' '}
          <button aria-label="Dismiss research error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      </Show>
      <Show when={saveState().state === 'error'}>
        <div class="message error" role="alert">
          <span>{saveState().message}</span>
          <button onClick={() => void saver?.retry().catch(() => undefined)}>Retry save</button>
          <button onClick={() => setReload(true)}>Reload saved</button>
        </div>
      </Show>
      <Show
        when={!loading()}
        fallback={
          <div class="empty-state">
            <p>Opening encrypted research workspace…</p>
          </div>
        }
      >
        <Show
          when={draft()}
          fallback={
            <div class="empty-state">
              <h2>Research is unavailable.</h2>
              <button class="button" onClick={() => void load()}>
                Retry opening research
              </button>
            </div>
          }
        >
          <header class="research-topbar">
            <div class="research-tabs" role="tablist" aria-label="OSINT sections">
              <button
                role="tab"
                tabIndex={tab() === 'map' ? 0 : -1}
                onKeyDown={tabKey}
                aria-selected={tab() === 'map'}
                aria-controls="research-map"
                id="research-map-tab"
                onClick={() => setTab('map')}
              >
                <span aria-hidden="true">⌘</span> Mindmap <small>{draft()!.nodes.length}</small>
              </button>
              <button
                role="tab"
                tabIndex={tab() === 'tools' ? 0 : -1}
                onKeyDown={tabKey}
                aria-selected={tab() === 'tools'}
                aria-controls="research-tools"
                id="research-tools-tab"
                onClick={() => setTab('tools')}
              >
                <span aria-hidden="true">⊞</span> OSINT tools <small>{draft()!.tools.length}</small>
              </button>
            </div>
            <span
              class={'research-save ' + saveState().state}
              role="status"
              aria-label="Research save status"
            >
              <span class="status-dot" />
              {saveState().state === 'saved'
                ? 'Saved to encrypted vault'
                : saveState().state === 'saving'
                  ? 'Saving research…'
                  : 'Changes need saving'}
            </span>
          </header>
          <div
            class="research-map"
            id="research-map"
            role="tabpanel"
            aria-labelledby="research-map-tab"
            hidden={tab() !== 'map'}
          >
            <div class="research-map-toolbar">
              <div>
                <span class="stamp">RESEARCH BOARD</span>
                <input
                  aria-label="Mindmap name"
                  maxLength={100}
                  value={draft()!.title}
                  onChange={(event) => {
                    if (event.currentTarget.value.trim())
                      change((document) => ({...document, title: event.currentTarget.value}));
                    else event.currentTarget.value = draft()!.title;
                  }}
                />
              </div>
              <div class="research-map-actions">
                <button
                  class="button subtle"
                  disabled={!history().length}
                  onClick={() => {
                    const previous = history().at(-1);
                    if (previous) {
                      setHistory((entries) => entries.slice(0, -1));
                      change(() => previous, false);
                    }
                  }}
                >
                  ↶ Undo
                </button>
                <button
                  class="button primary"
                  disabled={draft()!.nodes.length >= 100 || draft()!.edges.length >= 200}
                  onClick={addNode}
                >
                  ＋ Add node
                </button>
              </div>
            </div>
            <div class="research-map-layout">
              <div
                class="mind-stage"
                ref={observeStage}
                role="group"
                aria-label="Mindmap canvas"
                onPointerDown={(event) => begin(event)}
                onPointerMove={move}
                onPointerUp={(event) => end(event)}
                onPointerCancel={(event) => end(event, true)}
                onWheel={(event) => {
                  event.preventDefault();
                  zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
                }}
              >
                <div
                  class="mind-world"
                  style={{
                    transform: `translate(${camera().x}px, ${camera().y}px) scale(${camera().scale})`,
                  }}
                >
                  <svg class="mind-connections" aria-hidden="true">
                    <For each={draft()!.edges}>
                      {(edge) => {
                        const source = () =>
                          draft()!.nodes.find((node) => node.id === edge.source)!;
                        const target = () =>
                          draft()!.nodes.find((node) => node.id === edge.target)!;
                        const points = () => {
                          const a = source() ? position(source()) : {x: 0, y: 0},
                            b = target() ? position(target()) : {x: 0, y: 0};
                          const forward = a.x <= b.x;
                          const x1 = a.x + (forward ? NODE_WIDTH : 0),
                            x2 = b.x + (forward ? 0 : NODE_WIDTH);
                          const y1 = a.y + NODE_HEIGHT / 2,
                            y2 = b.y + NODE_HEIGHT / 2;
                          const curve = Math.max(60, Math.abs(x2 - x1) * 0.5);
                          return {x1, x2, y1, y2, curve: forward ? curve : -curve};
                        };
                        return (
                          <g
                            classList={{
                              'mind-edge-active':
                                edge.source === selectedId() || edge.target === selectedId(),
                            }}
                          >
                            <path
                              d={`M ${points().x1} ${points().y1} C ${points().x1 + points().curve} ${points().y1}, ${points().x2 - points().curve} ${points().y2}, ${points().x2} ${points().y2}`}
                            />
                            <Show when={edge.label}>
                              <text
                                x={(points().x1 + points().x2) / 2}
                                y={(points().y1 + points().y2) / 2 - 9}
                                text-anchor="middle"
                              >
                                {edge.label}
                              </text>
                            </Show>
                          </g>
                        );
                      }}
                    </For>
                  </svg>
                  <For each={draft()!.nodes.map((node) => node.id)}>
                    {(id) => {
                      const initial = draft()!.nodes.find((node) => node.id === id)!;
                      const node = () => draft()!.nodes.find((node) => node.id === id) || initial;
                      return (
                        <button
                          class={'mind-node kind-' + node().kind}
                          classList={{selected: selectedId() === id}}
                          style={{left: position(node()).x + 'px', top: position(node()).y + 'px'}}
                          aria-label={'Select node: ' + node().title}
                          aria-pressed={selectedId() === id}
                          onKeyDown={(event) => {
                            if (
                              !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                                event.key,
                              )
                            )
                              return;
                            event.preventDefault();
                            const delta = event.shiftKey ? 100 : 20;
                            change((document) => ({
                              ...document,
                              nodes: document.nodes.map((item) =>
                                item.id === id
                                  ? {
                                      ...item,
                                      x: clamp(
                                        item.x +
                                          (event.key === 'ArrowLeft'
                                            ? -delta
                                            : event.key === 'ArrowRight'
                                              ? delta
                                              : 0),
                                      ),
                                      y: clamp(
                                        item.y +
                                          (event.key === 'ArrowUp'
                                            ? -delta
                                            : event.key === 'ArrowDown'
                                              ? delta
                                              : 0),
                                      ),
                                    }
                                  : item,
                              ),
                            }));
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            begin(event, node());
                          }}
                          onClick={() => {
                            setSelectedId(id);
                            setLinkTarget('');
                          }}
                        >
                          <span class="mind-node-meta">
                            <span class="mind-kind">{kindMarks[node().kind]}</span>
                            {kindNames[node().kind]}
                            <span class="mind-node-handle" aria-hidden="true">
                              ⠿
                            </span>
                          </span>
                          <strong>{node().title}</strong>
                          <small>
                            {node().note ||
                              (node().sourceUrl
                                ? new URL(node().sourceUrl).hostname
                                : 'Add notes or a source')}
                          </small>
                        </button>
                      );
                    }}
                  </For>
                </div>
                <Show when={!draft()!.nodes.length}>
                  <div class="mind-empty">
                    <div class="mind-empty-mark" aria-hidden="true">
                      ◎<span>◌</span>
                      <span>◌</span>
                    </div>
                    <span class="stamp">MAKE THE CONNECTIONS</span>
                    <h2>Start with what you know.</h2>
                    <p>
                      Map a subject, connect your findings,
                      <br />
                      and keep the sources beside the evidence.
                    </p>
                    <button class="button primary" onClick={addNode}>
                      ＋ Create first node
                    </button>
                  </div>
                </Show>
                <div class="mind-canvas-hint">Drag nodes to arrange · Drag space to pan</div>
                <div class="mind-zoom" onPointerDown={(event) => event.stopPropagation()}>
                  <button aria-label="Zoom out mindmap" onClick={() => zoom(1 / 1.2)}>
                    −
                  </button>
                  <span>{Math.round(camera().scale * 100)}%</span>
                  <button aria-label="Zoom in mindmap" onClick={() => zoom(1.2)}>
                    ＋
                  </button>
                  <button aria-label="Fit mindmap" onClick={fit}>
                    Fit
                  </button>
                </div>
              </div>
              <aside class="research-inspector" aria-label="Node details">
                <Show
                  when={selected()}
                  fallback={
                    <div class="research-inspector-empty">
                      <span class="stamp">NODE DETAILS</span>
                      <div aria-hidden="true">⌁</div>
                      <h3>A place for every lead.</h3>
                      <p>
                        Select a node to add notes, attach a source or connect it to another
                        finding.
                      </p>
                      <div class="research-key">
                        <For each={researchKinds}>
                          {(kind) => (
                            <span class={'kind-' + kind}>
                              <i>{kindMarks[kind]}</i>
                              {kindNames[kind]}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  }
                >
                  {(node) => (
                    <>
                      <div class="research-inspector-heading">
                        <span class="stamp">NODE DETAILS</span>
                        <span class="pill">{kindNames[node().kind]}</span>
                      </div>
                      <label>
                        Node title
                        <input
                          ref={titleInput}
                          aria-label="Node title"
                          maxLength={100}
                          value={node().title}
                          onChange={(event) => {
                            if (event.currentTarget.value.trim())
                              patchNode({title: event.currentTarget.value});
                            else event.currentTarget.value = node().title;
                          }}
                        />
                      </label>
                      <label>
                        Type
                        <select
                          aria-label="Node type"
                          value={node().kind}
                          onChange={(event) =>
                            patchNode({kind: event.currentTarget.value as MindNode['kind']})
                          }
                        >
                          <For each={researchKinds}>
                            {(kind) => <option value={kind}>{kindNames[kind]}</option>}
                          </For>
                        </select>
                      </label>
                      <label>
                        Research notes
                        <textarea
                          aria-label="Research notes"
                          rows={5}
                          maxLength={4000}
                          placeholder="Findings, questions, next steps…"
                          value={node().note}
                          onInput={(event) => patchNode({note: event.currentTarget.value}, false)}
                        />
                      </label>
                      <label>
                        Source URL
                        <input
                          aria-label="Source URL"
                          placeholder="https://"
                          maxLength={2048}
                          value={node().sourceUrl}
                          onChange={(event) => {
                            const parsed = MindNodeSchema.shape.sourceUrl.safeParse(
                              event.currentTarget.value.trim(),
                            );
                            if (parsed.success) patchNode({sourceUrl: parsed.data});
                            else {
                              setError(
                                'Use an HTTP or HTTPS source URL without embedded credentials.',
                              );
                              event.currentTarget.value = node().sourceUrl;
                            }
                          }}
                        />
                      </label>
                      <Show when={node().sourceUrl}>
                        <button
                          class="button subtle research-source"
                          disabled={opening()}
                          onClick={() => void openUrl(node().sourceUrl)}
                        >
                          {props.session?.status === 'active'
                            ? 'Open source in routed browser ↗'
                            : 'Set up routed browser ↗'}
                        </button>
                      </Show>
                      <div class="research-links">
                        <span class="stamp">CONNECTIONS · {links().length}</span>
                        <For each={links()}>
                          {(edge) => {
                            const other = () =>
                              draft()!.nodes.find(
                                (item) =>
                                  item.id ===
                                  (edge.source === node().id ? edge.target : edge.source),
                              );
                            return (
                              <div class="research-link">
                                <button onClick={() => setSelectedId(other()?.id || '')}>
                                  <strong>{other()?.title}</strong>
                                  <small>{edge.label || 'Connected'}</small>
                                </button>
                                <button
                                  class="icon-button"
                                  aria-label={'Remove connection to ' + other()?.title}
                                  onClick={() =>
                                    change((document) => ({
                                      ...document,
                                      edges: document.edges.filter((item) => item.id !== edge.id),
                                    }))
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            );
                          }}
                        </For>
                        <Show when={targets().length}>
                          <label>
                            Connect to
                            <select
                              aria-label="Connect to node"
                              value={linkTarget()}
                              onChange={(event) => setLinkTarget(event.currentTarget.value)}
                            >
                              <option value="">Choose a node</option>
                              <For each={targets()}>
                                {(target) => <option value={target.id}>{target.title}</option>}
                              </For>
                            </select>
                          </label>
                          <Show when={linkTarget()}>
                            <label>
                              Relationship
                              <input
                                maxLength={80}
                                value={linkLabel()}
                                onInput={(event) => setLinkLabel(event.currentTarget.value)}
                                placeholder="e.g. references"
                              />
                            </label>
                          </Show>
                          <button
                            class="button subtle"
                            disabled={!linkTarget() || draft()!.edges.length >= 200}
                            onClick={connectNodes}
                          >
                            ＋ Connect nodes
                          </button>
                        </Show>
                      </div>
                      <button
                        class="research-delete"
                        onClick={() =>
                          setRemoving({kind: 'node', id: node().id, name: node().title})
                        }
                      >
                        Delete node
                      </button>
                    </>
                  )}
                </Show>
              </aside>
            </div>
            <footer class="research-footer">
              <span>
                {draft()!.nodes.length} nodes <i>·</i> {draft()!.edges.length} connections
              </span>
              <span>Notes and sources stay in your vault.</span>
            </footer>
          </div>
          <div
            id="research-tools"
            role="tabpanel"
            aria-labelledby="research-tools-tab"
            hidden={tab() !== 'tools'}
          >
            <div class="research-tools-heading">
              <div>
                <span class="stamp">YOUR RESEARCH TOOLKIT</span>
                <h2>The right tool, within reach.</h2>
                <p>Keep your sources and services in one place. Add the tools you use.</p>
              </div>
              <button
                class="button primary"
                disabled={draft()!.tools.length >= 60}
                onClick={() => {
                  setToolError('');
                  setToolEditor(blankTool());
                }}
              >
                ＋ Add tool
              </button>
            </div>
            <div class="research-route-note">
              <span class={props.session?.status === 'active' ? 'status-dot' : 'amber-dot'} />
              <div>
                <strong>
                  {props.session?.status === 'active'
                    ? 'Route ready · ' + props.session.profileName
                    : 'Open a routed browser to use tools'}
                </strong>
                <p>
                  {props.session?.status === 'active'
                    ? 'Links open in this session. No tool is contacted until you choose Open.'
                    : 'Your tool library stays available offline. Website tools need an active session.'}
                </p>
              </div>
              <Show when={props.session?.status !== 'active'}>
                <button class="button subtle" onClick={props.openBrowser}>
                  Go to Browser ↗
                </button>
              </Show>
            </div>
            <div class="research-tools-filter">
              <div class="search">
                <span>⌕</span>
                <input
                  aria-label="Search OSINT tools"
                  value={query()}
                  placeholder="Search tools, domains or descriptions…"
                  onInput={(event) => setQuery(event.currentTarget.value)}
                />
              </div>
              <div class="research-categories" aria-label="Tool categories">
                <For each={['All', ...toolCategories]}>
                  {(item) => (
                    <button
                      classList={{active: category() === item}}
                      aria-pressed={category() === item}
                      onClick={() => setCategory(item)}
                    >
                      {item}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="research-tool-grid">
              <For each={tools()}>
                {(tool) => (
                  <article class="research-tool">
                    <div class="research-tool-top">
                      <span class="research-tool-mark" aria-hidden="true">
                        {tool.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span class="pill">{tool.category}</span>
                      <button
                        class={'icon-button research-pin ' + (tool.pinned ? 'pinned' : '')}
                        aria-label={(tool.pinned ? 'Unpin ' : 'Pin ') + tool.name}
                        aria-pressed={tool.pinned}
                        onClick={() =>
                          change((document) => ({
                            ...document,
                            tools: document.tools.map((item) =>
                              item.id === tool.id ? {...item, pinned: !item.pinned} : item,
                            ),
                          }))
                        }
                      >
                        ☆
                      </button>
                    </div>
                    <h3>{tool.name}</h3>
                    <span class="research-tool-host">{new URL(tool.url).hostname}</span>
                    <p>{tool.description || 'Your saved research tool.'}</p>
                    <div class="research-tool-actions">
                      <button
                        class="button subtle"
                        disabled={opening() || props.session?.status !== 'active'}
                        onClick={() => void openUrl(tool.url)}
                      >
                        Open ↗
                      </button>
                      <button
                        class="research-tool-edit"
                        aria-label={'Edit ' + tool.name}
                        onClick={() => {
                          setToolError('');
                          setToolEditor({...tool});
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </article>
                )}
              </For>
            </div>
            <Show when={!tools().length}>
              <div class="empty-state">
                <h2>
                  {query() || category() !== 'All'
                    ? 'No matching tools.'
                    : 'Build your own toolkit.'}
                </h2>
                <p>
                  {query() || category() !== 'All'
                    ? 'Try another search or category.'
                    : 'Add a website tool to keep it within reach.'}
                </p>
              </div>
            </Show>
            <footer class="research-footer">
              <span>
                {tools().length} of {draft()!.tools.length} tools
              </span>
              <span>Public source links · No automatic queries</span>
            </footer>
          </div>
        </Show>
      </Show>
      <EncryptedNotepad
        api={props.api}
        registerFlush={(flush) => {
          flushNotepad = flush;
        }}
      />
      <Show when={toolEditor()}>
        {(tool) => (
          <Modal
            title={
              draft()?.tools.some((item) => item.id === tool().id)
                ? 'Edit OSINT tool'
                : 'Add OSINT tool'
            }
            subtitle="Save a website to your encrypted tool library."
            close={() => setToolEditor()}
          >
            <form onSubmit={saveTool}>
              <Show when={toolError()}>
                <div class="message error" role="alert">
                  {toolError()}
                </div>
              </Show>
              <label>
                Tool name
                <input
                  aria-label="Tool name"
                  required
                  maxLength={80}
                  value={tool().name}
                  onInput={(event) => setToolEditor({...tool(), name: event.currentTarget.value})}
                />
              </label>
              <label>
                Website URL
                <input
                  aria-label="Tool website URL"
                  type="url"
                  required
                  maxLength={2048}
                  placeholder="https://"
                  value={tool().url}
                  onInput={(event) => setToolEditor({...tool(), url: event.currentTarget.value})}
                />
              </label>
              <label>
                Category
                <select
                  aria-label="Tool category"
                  value={tool().category}
                  onChange={(event) =>
                    setToolEditor({
                      ...tool(),
                      category: event.currentTarget.value as ResearchTool['category'],
                    })
                  }
                >
                  <For each={toolCategories}>{(item) => <option>{item}</option>}</For>
                </select>
              </label>
              <label>
                Description
                <textarea
                  aria-label="Tool description"
                  rows={3}
                  maxLength={300}
                  value={tool().description}
                  onInput={(event) =>
                    setToolEditor({...tool(), description: event.currentTarget.value})
                  }
                />
              </label>
              <div class="modal-actions">
                <Show when={draft()?.tools.some((item) => item.id === tool().id)}>
                  <button
                    type="button"
                    class="button danger"
                    onClick={() => {
                      setRemoving({kind: 'tool', id: tool().id, name: tool().name});
                      setToolEditor();
                    }}
                  >
                    Remove tool
                  </button>
                </Show>
                <button type="button" class="button" onClick={() => setToolEditor()}>
                  Cancel
                </button>
                <button class="button primary" type="submit">
                  Save tool
                </button>
              </div>
            </form>
          </Modal>
        )}
      </Show>
      <Show when={removing()}>
        {(item) => (
          <Modal
            title={'Remove ' + item().name + '?'}
            subtitle={
              item().kind === 'node'
                ? 'This removes the node, its notes and its connections. Other nodes stay on your map.'
                : 'This removes the saved link from your tool library.'
            }
            close={() => setRemoving()}
          >
            <div class="modal-actions">
              <button class="button" onClick={() => setRemoving()}>
                Keep {item().kind}
              </button>
              <button class="button danger" onClick={remove}>
                Remove {item().kind}
              </button>
            </div>
          </Modal>
        )}
      </Show>
      <Show when={reload()}>
        <Modal
          title="Reload saved research?"
          subtitle="This replaces the edits in this window with the version saved in the vault. Copy any unsaved notes you want to keep first."
          close={() => setReload(false)}
        >
          <div class="modal-actions">
            <button class="button" onClick={() => setReload(false)}>
              Keep editing
            </button>
            <button
              class="button danger"
              onClick={() => {
                setReload(false);
                void load();
              }}
            >
              Reload saved workspace
            </button>
          </div>
        </Modal>
      </Show>
    </section>
  );
}
