import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import type { Profile, RequestType, Snapshot, SnapshotPreview, MergePreview, WorkspaceStatus } from '../../shared/src/model';
import SnapshotPanel from './SnapshotPanel';
import DiffTable from './DiffTable';
import BranchDialog,{type BranchDialogState} from './BranchDialog';
import VpnDialog from './VpnDialog';
import type {CredentialPresence,RelayCatalog,VpnSettingsType} from '../../shared/src/vpn';

const time=(value:number)=>new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
export default function App() {
  const [status,setStatus]=createSignal<WorkspaceStatus>();
  const [profiles,setProfiles]=createSignal<Profile[]>([]);
  const [selected,setSelected]=createSignal<string>();
  const [snapshots,setSnapshots]=createSignal<Snapshot[]>([]);
  const [search,setSearch]=createSignal('');
  const [error,setError]=createSignal(''); const [notice,setNotice]=createSignal('');
  const [busy,setBusy]=createSignal(false);
  const [passphrase,setPassphrase]=createSignal(''); const [confirmation,setConfirmation]=createSignal('');
  const [memory,setMemory]=createSignal(256);
  const [editor,setEditor]=createSignal(false); const [editing,setEditing]=createSignal<Profile>();
  const [name,setName]=createSignal(''); const [tags,setTags]=createSignal('');
  const [timezone,setTimezone]=createSignal('UTC'); const [language,setLanguage]=createSignal('en-US');
  const [screen,setScreen]=createSignal('1920 × 1080');
  const [restoreTarget,setRestoreTarget]=createSignal<SnapshotPreview>();
  const [branchDialog,setBranchDialog]=createSignal<BranchDialogState>();
  const [vpnProfile,setVpnProfile]=createSignal<Profile>();
  const [credentials,setCredentials]=createSignal<CredentialPresence>({mullvad:false,ivpn:false});
  const current=createMemo(()=>profiles().find(p=>p.id===selected()));
  const filtered=createMemo(()=>profiles().filter(p=>`${p.name} ${p.tags.join(' ')}`.toLowerCase().includes(search().toLowerCase())));
  const bridge=!!window.styg;
  async function invoke<T>(request:RequestType):Promise<T> {
    if(!window.styg) throw new Error('Open Styg in Electron to use the encrypted workspace.');
    const result=await window.styg.invoke<T>(request);
    if(!result.ok) throw new Error(result.error);
    return result.value;
  }
  async function run(action:()=>Promise<void>) {
    if(busy()) return; setBusy(true); setError(''); setNotice('');
    try {await action();} catch(error) {setError(error instanceof Error?error.message:'Operation failed');}
    finally {setBusy(false);}
  }
  async function refresh(id?:string) {
    setStatus(await invoke<WorkspaceStatus>({action:'status'}));
    if(!status()?.unlocked) {setVpnProfile(undefined);setCredentials({mullvad:false,ivpn:false});setProfiles([]);setSnapshots([]);setSelected(undefined);setRestoreTarget(undefined);setBranchDialog(undefined);setEditing(undefined);setName('');setTags('');return;}
    const list=await invoke<Profile[]>({action:'profiles'}); setProfiles(list);
    const next=[id,selected(),list[0]?.id].find(candidate=>list.some(profile=>profile.id===candidate)); setSelected(next);
    setSnapshots(next?await invoke<Snapshot[]>({action:'snapshots',id:next}):[]);
  }
  onMount(()=>{if(bridge) void run(()=>refresh());});
  async function unlock(event:SubmitEvent) {
    event.preventDefault();
    await run(async()=>{
      if(!status()?.exists && passphrase()!==confirmation()) throw new Error('Passphrases do not match.');
      await invoke(status()?.exists?{action:'unlock',passphrase:passphrase()}:{action:'createWorkspace',passphrase:passphrase(),memoryMiB:memory() as 64|256|1024|4096});
      setPassphrase('');setConfirmation('');await refresh();
    });
  }
  function openEditor(profile?:Profile) {
    setEditing(profile);setName(profile?.name??'');setTags(profile?.tags.join(', ')??'');
    setTimezone(profile?.timezone??'UTC');setLanguage(profile?.language??'en-US');setScreen(profile?.screen??'1920 × 1080');setEditor(true);
  }
  async function save(event:SubmitEvent) {
    event.preventDefault();await run(async()=>{
      const input={name:name(),tags:tags().split(',').map(s=>s.trim()).filter(Boolean),timezone:timezone(),language:language() as Profile['language'],screen:screen() as Profile['screen']};
      const active=editing();
      const profile=await invoke<Profile>(active?{action:'updateProfile',id:active.id,input}:{action:'createProfile',input});
      setEditor(false);await refresh(profile.id);setNotice(active?'Changes saved. A pre-edit snapshot is available.':'Profile created with an encrypted baseline snapshot.');
    });
  }
  function openBranch(kind:'create'|'promote'|'discard',profile:Profile){setError('');setBranchDialog({kind,profile});}
  async function createBranch(name:string) {
    await run(async()=>{
      const dialog=branchDialog();if(dialog?.kind!=='create')return;
      const branch=await invoke<Profile>({action:'createBranch',id:dialog.profile.id,name});
      setBranchDialog(undefined);await refresh(branch.id);setNotice('Independent branch created with copied history and a pinned fork point.');
    });
  }
  async function confirmBranch() {
    await run(async()=>{
      const dialog=branchDialog();if(!dialog||dialog.kind==='create')return;
      if(dialog.kind==='merge') {
        const preview=dialog.preview;const parent=await invoke<Profile>({action:'mergeBranch',id:preview.branch.id,branchRevision:preview.branchRevision,parentRevision:preview.parentRevision});
        setBranchDialog(undefined);await refresh(parent.id);setNotice('Environment settings merged. Parent browser files, name and tags are unchanged.');
      }else if(dialog.kind==='promote') {
        const profile=await invoke<Profile>({action:'promoteBranch',id:dialog.profile.id,expectedRevision:dialog.profile.revision});
        setBranchDialog(undefined);await refresh(profile.id);setNotice('Profile promoted. Files and snapshot history are unchanged.');
      }else {
        await invoke({action:'discardBranch',id:dialog.profile.id,expectedRevision:dialog.profile.revision});
        setBranchDialog(undefined);await refresh(dialog.profile.parentProfileId??undefined);setNotice('Branch discarded. Its parent is unchanged.');
      }
    });
  }
  return <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" onClick={e=>e.preventDefault()} aria-label="Styg home"><span class="brand-mark">s</span>styg<span class="brand-dot">.</span></a>
      <div class="workspace-label"><span class="workspace-avatar">P</span><div>Personal workspace<small>Local · single operator</small></div><span class="muted">⌄</span></div>
      <div class="nav-label">WORKSPACE</div>
      <button class="nav-item active"><span>▦</span> Profiles <span class="count">{profiles().length}</span></button>
      <div class="nav-label tools-label">FOUNDATION</div>
      <div class="nav-note"><span class="tiny-dot"/> Encrypted workspace</div>
      <div class="nav-note"><span class="tiny-dot"/> Encrypted snapshots</div>
      <div class="nav-note muted"><span class="tiny-dot amber"/> Routing verification pending</div>
      <div class="sidebar-bottom"><div class="version">STYG <span>0.6.0 · provider registration</span></div><div class="local-note">Your workspace stays on this device.</div></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div><span class="muted">Workspace</span><span class="breadcrumb">/</span>Profiles</div><div class="topbar-right"><span class="local-pill"><span class="tiny-dot"/> Local workspace</span><Show when={status()?.unlocked}><button class="text-button" disabled={busy()} onClick={()=>void run(async()=>{const result=await invoke<{incompleteSnapshots:number}>({action:'lock'});setEditor(false);setRestoreTarget(undefined);setSearch('');await refresh();if(result.incompleteSnapshots)setNotice('Workspace locked. Some session snapshots were incomplete; working files are preserved.');})}>Lock workspace ↗</button></Show></div></header>
      <main>
        <Show when={error()}><div class="message error" role="alert">{error()}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div></Show>
        <Show when={notice()}><div class="message success" role="status">{notice()}</div></Show>
        <Show when={status()?.unlocked} fallback={<div class="onboarding">
          <div class="eyebrow">A QUIETER CORNER OF THE INTERNET</div>
          <h1>Your workspace.<br/>Your control.</h1>
          <p class="intro">Separate your profiles. Keep a way back.<br/>Start with an encrypted workspace on this device.</p>
          <form class="unlock-panel" onSubmit={unlock}>
            <div class="panel-kicker">{status()?.exists?'WELCOME BACK':'01 / CREATE YOUR WORKSPACE'}</div>
            <h2>{status()?.exists?'Unlock Styg':'Make it yours'}</h2>
            <p class="muted">{status()?.exists?'Enter your passphrase to open your local workspace.':'Your passphrase protects profile settings and saved snapshots. There is no passphrase recovery.'}</p>
            <label>Workspace passphrase<input type="password" autocomplete={status()?.exists?'current-password':'new-password'} minLength={status()?.exists?1:12} maxLength={1024} required value={passphrase()} onInput={e=>setPassphrase(e.currentTarget.value)}/></label>
            <Show when={!status()?.exists}>
              <label>Confirm passphrase<input type="password" autocomplete="new-password" minLength={12} required value={confirmation()} onInput={e=>setConfirmation(e.currentTarget.value)}/></label>
              <details><summary>Key derivation settings</summary><label>Argon2id memory<select value={memory()} onChange={e=>setMemory(Number(e.currentTarget.value))}><option value="64">64 MiB · minimum</option><option value="256">256 MiB · balanced</option><option value="1024">1 GiB · high memory</option><option value="4096">4 GiB · requires ample free RAM</option></select></label></details>
            </Show>
            <button class="primary wide" disabled={!bridge||busy()} type="submit">{busy()?'Deriving encryption key…':status()?.exists?'Unlock workspace':'Create encrypted workspace'} <span>↗</span></button>
            <Show when={!bridge}><div class="preview-notice"><strong>Desktop bridge unavailable</strong><br/>This browser preview shows the interface. Open the Electron app to create or unlock a real workspace.</div></Show>
          </form>
          <div class="onboarding-foot"><span>◈ Encrypted at rest</span><span>↶ Recoverable changes</span><span>⌁ Local by default</span></div>
        </div>}>
          <section class="page-heading"><div><div class="eyebrow">PERSONAL WORKSPACE</div><h1>Profiles<span class="heading-dot">.</span></h1><p class="muted">A separate space for every context.</p></div><button class="primary" disabled={busy()||profiles().length>=99} onClick={()=>openEditor()}>＋ New profile</button></section>
          <section class="stats"><div><span class="stat-label">TOTAL PROFILES</span><strong>{profiles().length}<small>/ 99</small></strong><span>Separate local profile folders</span></div><div><span class="stat-label">WORKSPACE</span><strong class="stat-word">Unlocked <span class="tiny-dot"/></strong><span>Settings and snapshots encrypted</span></div><div><span class="stat-label">RECOVERY</span><strong class="stat-word">Automatic</strong><span>Configuration snapshots before edits</span></div></section>
          <div class="routing-banner"><span class="route-icon">⌁</span><div><strong>Route verification required</strong><p>Networked launches stay blocked until OS-level isolation and disconnect blocking are verified.</p></div><span class="status-tag warning">BLOCKED</span></div>
          <div class="profiles-toolbar"><div class="tabs"><span class="selected-tab">All profiles <b>{profiles().length}</b></span></div><label class="search"><span>⌕</span><input aria-label="Search profiles" placeholder="Search name or tag…" value={search()} onInput={e=>setSearch(e.currentTarget.value)}/></label></div>
          <div class="workspace-content"><section class="profile-grid" aria-label="Profiles">
            <Show when={filtered().length===0}><div class="empty"><div class="empty-icon">▦</div><h2>{profiles().length?'No matching profiles':'A clean slate'}</h2><p>{profiles().length?'Try another name or tag.':'Create your first profile. Styg will save its baseline automatically.'}</p><Show when={!profiles().length}><button class="secondary" onClick={()=>openEditor()}>Create first profile ↗</button></Show></div></Show>
            <For each={filtered()}>{profile=><article class={`profile-card ${selected()===profile.id?'is-selected':''}`}>
              <button class="profile-main" disabled={busy()} onClick={()=>void run(async()=>{setSelected(profile.id);setSnapshots(await invoke<Snapshot[]>({action:'snapshots',id:profile.id}));})}>
                <div class="card-top"><span class="profile-avatar">{profile.name.slice(0,2).toUpperCase()}</span><Show when={profile.parentProfileId} fallback={<span class="card-menu">↗</span>}><span class="branch-badge">BRANCH</span></Show></div>
                <h2>{profile.name}</h2><div class="profile-id">{profile.id.slice(0,8)} · LOCAL PROFILE</div>
                <div class="tag-row"><For each={profile.tags}>{tag=><span class="tag">{tag}</span>}</For><Show when={!profile.tags.length}><span class="muted">No tags</span></Show></div>
                <div class="config-line"><span>◷</span>{profile.timezone}</div><div class="config-line"><span>▱</span>{profile.screen}<span class="config-language">{profile.language}</span></div>
              </button>
              <div class="card-footer"><span><span class="tiny-dot"/> Config saved</span><button class="secondary small" disabled={busy()} onClick={()=>void run(async()=>{setCredentials(await invoke<CredentialPresence>({action:'vpnCredentials'}));setVpnProfile(profile);})}>VPN setup</button><button class="secondary small" disabled={busy()} onClick={()=>openEditor(profile)}>Edit profile</button></div>
            </article>}</For>
          </section>
          <Show when={current()}>{profile=><SnapshotPanel
            profile={profile()} snapshots={snapshots()} busy={busy()}
            onSave={()=>void run(async()=>{
              const saved=await invoke<Snapshot>({action:'saveStateSnapshot',id:profile().id});
              await refresh(profile().id);
              setNotice(`Encrypted browser-state snapshot saved (${saved.fileCount} ${saved.fileCount===1?'file':'files'}).`);
            })}
            onPin={snapshot=>void run(async()=>{await invoke({action:'pin',id:profile().id,snapshotId:snapshot.id,pinned:!snapshot.pinned});await refresh(profile().id);})}
            canCreateBranch={profiles().length<99} parentName={profiles().find(p=>p.id===profile().parentProfileId)?.name}
            onCreateBranch={()=>openBranch('create',profile())}
            onMerge={()=>void run(async()=>{setBranchDialog({kind:'merge',preview:await invoke<MergePreview>({action:'previewMerge',id:profile().id})});})}
            onPromote={()=>openBranch('promote',profile())} onDiscard={()=>openBranch('discard',profile())}
            onRestore={snapshot=>void run(async()=>{setRestoreTarget(await invoke<SnapshotPreview>({action:'previewSnapshot',id:profile().id,snapshotId:snapshot.id}));})}
          />}</Show></div>
          <footer class="workspace-footer"><span><span class="tiny-dot"/> Stored locally · encrypted at rest</span><span>Styg provider registration preview / 0.6.0</span></footer>
        </Show>
      </main>
    </div>
    <Show when={editor()}><div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><div class="modal-top"><span class="eyebrow">PROFILE CONFIGURATION</span><button class="close-button" aria-label="Close editor" disabled={busy()} onClick={()=>setEditor(false)}>×</button></div><h2 id="editor-title">{editing()?'Edit profile':'A new context'}</h2><p class="muted">{editing()?'Styg saves a snapshot before applying your changes.':'Start with a name. A baseline snapshot is saved automatically.'}</p><form onSubmit={save}><label>Profile name<input autofocus required maxLength={100} value={name()} onInput={e=>setName(e.currentTarget.value)} placeholder="e.g. Research — Europe"/></label><label>Tags <span class="muted">· comma separated</span><input value={tags()} onInput={e=>setTags(e.currentTarget.value)} placeholder="research, client-work"/></label><label>Timezone<input required list="timezones" value={timezone()} onInput={e=>setTimezone(e.currentTarget.value)}/><datalist id="timezones"><option>UTC</option><option>America/New_York</option><option>Europe/Berlin</option><option>Europe/London</option><option>Asia/Tokyo</option></datalist></label><div class="form-row"><label>Language<select value={language()} onChange={e=>setLanguage(e.currentTarget.value)}><option>en-US</option><option>en-GB</option><option>de-DE</option><option>fr-FR</option></select></label><label>Screen size<select value={screen()} onChange={e=>setScreen(e.currentTarget.value)}><option>1920 × 1080</option><option>1440 × 900</option><option>1366 × 768</option></select></label></div><Show when={error()}><p class="amber-text" role="status">{error()}</p></Show><div class="modal-actions"><button type="button" class="secondary" disabled={busy()} onClick={()=>setEditor(false)}>Cancel</button><button class="primary" disabled={busy()} type="submit">{busy()?'Saving…':editing()?'Save changes':'Create profile'} ↗</button></div></form></section></div></Show>
    <Show when={restoreTarget()}>{snapshot=><div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <span class="eyebrow">RECOVERY</span>
      <h2 id="restore-title">{snapshot().snapshot.hasBrowserState?'Restore configuration and browser state?':'Restore this configuration?'}</h2>
      <p class="muted">{snapshot().snapshot.hasBrowserState
        ?`Replace this profile's settings and browser files with the snapshot from ${time(snapshot().snapshot.timestamp)}. Styg saves a full rollback snapshot first. Close the browser before continuing. Use the same OS account and a compatible browser build; protected cookies may also require the original OS key store.`
        :`Replace the current settings with the configuration from ${time(snapshot().snapshot.timestamp)}. Styg saves the current configuration as a rollback point. Browser files remain unchanged.`}</p>
      <h3 class="diff-heading">Changes from current settings</h3><DiffTable changes={snapshot().changes}/>
      <Show when={error()}><p class="amber-text" role="alert">{error()}</p></Show>
      <div class="modal-actions">
        <button class="secondary" disabled={busy()} onClick={()=>setRestoreTarget(undefined)}>Cancel</button>
        <button class="primary" disabled={busy()} onClick={()=>void run(async()=>{
          const preview=snapshot(),target=preview.snapshot;
          await invoke({action:'restore',id:target.profileId,snapshotId:target.id,expectedRevision:preview.currentRevision});
          setRestoreTarget(undefined);await refresh();
          setNotice(target.hasBrowserState?'Profile settings and browser files restored. A full rollback snapshot is available.':'Configuration restored. Browser files are unchanged; a configuration rollback point is available.');
        })}>{busy()?'Restoring…':snapshot().snapshot.hasBrowserState?'Restore profile and state':'Restore configuration'} ↶</button>
      </div>
    </section></div>}</Show>
    <Show when={branchDialog()}>{dialog=><BranchDialog dialog={dialog()} busy={busy()} error={error()} onCancel={()=>setBranchDialog(undefined)} onCreate={name=>void createBranch(name)} onConfirm={()=>void confirmBranch()}/>}</Show>
    <Show when={vpnProfile()}>{profile=><VpnDialog profile={profile()} credentials={credentials()} busy={busy()} error={error()} invoke={invoke} onClose={()=>{setVpnProfile(undefined);setError('');}}
      onSave={async(settings:VpnSettingsType)=>{await run(async()=>{const id=profile().id;await invoke({action:'updateProfile',id,input:{vpn:settings}});setVpnProfile(undefined);await refresh(id);setNotice('VPN settings saved with a pre-edit snapshot. Protected routing remains pending.');});}}
      onSaveCredential={async(provider,account)=>{await run(async()=>{await invoke({action:'saveVpnCredential',credential:{provider,account}});setCredentials(await invoke<CredentialPresence>({action:'vpnCredentials'}));});}}
      onClearCredential={async provider=>{await run(async()=>{await invoke({action:'clearVpnCredential',provider});setCredentials(await invoke<CredentialPresence>({action:'vpnCredentials'}));});}}
      onCatalog={async provider=>{
        const id=profile().id;setError('');
        try {const result=await invoke<RelayCatalog>({action:'vpnCatalog',provider});return vpnProfile()?.id===id&&status()?.unlocked?result:undefined;}
        catch(error){if(vpnProfile()?.id===id&&status()?.unlocked)setError(error instanceof Error?error.message:'Catalog refresh failed');return undefined;}
      }}
    />}</Show>
  </div>;
}
