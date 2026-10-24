import {createEffect,createSignal,For,onCleanup,onMount,Show,Switch,Match,type JSX} from 'solid-js';
import type {UiPreferences} from './preferences';
import SettingsIcon,{type SettingsIconName} from './SettingsIcon';
import './settings.css';

type Detail='personalization'|'mindmap'|'socks5'|'email'|'subscription'|'trocador'|'report'|'general'|'notifications'|'monero'|'security'|'cloud'|'storage'|'help'|'shortcuts';
type Section='environment'|'account'|'appearance'|'app'|'help';
const sections:{id:Section;label:string}[]=[{id:'environment',label:'Environment'},{id:'account',label:'Account'},{id:'appearance',label:'Appearance'},{id:'app',label:'App'},{id:'help',label:'Help'}];
const titles:Record<Detail,string>={personalization:'Personalization',mindmap:'Mindmap',socks5:'SOCKS5',email:'Email',subscription:'Subscription',trocador:'Trocador',report:'Browsing report',general:'General',notifications:'Notifications',monero:'Monero',security:'Security',cloud:'Secure cloud storage',storage:'Storage',help:'Help centre',shortcuts:'Keyboard shortcuts'};
type Props={preferences:UiPreferences;onPreferencesChange:(patch:Partial<UiPreferences>)=>void;persistenceAvailable:boolean;onClose:()=>void;onLock:()=>void;unlocked:boolean;busy:boolean;profileCount:number;snapshotCount:number;platform:string;version:string};

export default function SettingsPanel(props:Props) {
  let dialog!:HTMLDialogElement,scroll!:HTMLDivElement,back!:HTMLButtonElement;
  const [detail,setDetail]=createSignal<Detail>();
  const [active,setActive]=createSignal<Section>('environment');
  let previousRow:Detail|undefined;
  function containFocus(event:KeyboardEvent){
    if(event.key!=='Tab')return;
    const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1),focused=document.activeElement;
    if(first&&((event.shiftKey&&(focused===first||!dialog.contains(focused)))||(!event.shiftKey&&(focused===last||!dialog.contains(focused))))){event.preventDefault();(event.shiftKey?last:first)?.focus();}
  }
  function openDetail(id:Detail){previousRow=id;setDetail(id);scroll.scrollTop=0;}
  function closeDetail(){setDetail(undefined);queueMicrotask(()=>dialog.querySelector<HTMLButtonElement>(`[data-setting-row="${previousRow}"]`)?.focus());}
  function jump(id:Section){setActive(id);if(id==='environment')scroll.scrollTop=0;else dialog.querySelector(`#settings-${id}`)?.scrollIntoView({block:'start',behavior:'instant'});}
  createEffect(()=>{if(detail())queueMicrotask(()=>back?.focus());});
  onMount(()=>{dialog.showModal();});
  onCleanup(()=>{dialog.close();});
  const Row=(row:{id:Detail;icon:SettingsIconName;value?:string;dot?:boolean;accent?:boolean})=><button type="button" class={`settings-row ${row.accent?'settings-row-accent':''}`} data-setting-row={row.id} onClick={()=>openDetail(row.id)}>
    <SettingsIcon name={row.icon}/><span class="settings-row-label">{titles[row.id]}</span>
    <Show when={row.value}><span class="settings-row-value"><Show when={row.dot}><span class="settings-state-dot"/></Show>{row.value}</span></Show>
    <SettingsIcon name="next" class="settings-chevron"/>
  </button>;
  const Group=(group:{id?:Section;label:string;accessibleLabel?:string;children:JSX.Element})=><section id={group.id?`settings-${group.id}`:undefined} class="settings-section">
    <h2 aria-label={group.accessibleLabel??group.label}>{group.label}</h2><div class="settings-card">{group.children}</div>
  </section>;
  const Note=(note:{title:string;children:JSX.Element})=><div class="settings-note"><h3>{note.title}</h3><div>{note.children}</div></div>;
  return <dialog ref={dialog} class="settings-dialog" aria-labelledby="settings-title" onKeyDown={containFocus} onCancel={event=>{event.preventDefault();detail()?closeDetail():props.onClose();}}>
    <button class="settings-close" aria-label="Close settings" autofocus onClick={props.onClose}><SettingsIcon name="close"/></button>
    <div ref={scroll} class="settings-scroll">
      <header class="settings-header"><p class="settings-kicker">YOUR ENVIRONMENT, YOUR CONTROL</p><h1 id="settings-title">Settings</h1><p class="settings-intro">Device preferences and workspace configuration.<br/>Settings stay on this device. Cloud sync is off.</p></header>
      <Show when={!props.persistenceAvailable}><p class="settings-storage-message" role="status">Preferences apply for this session. Device storage is unavailable.</p></Show>
      <Show when={!detail()} fallback={<div class="settings-detail">
        <button ref={back} class="settings-back" onClick={closeDetail}><SettingsIcon name="back"/>Back to settings</button>
        <h2>{detail()?titles[detail()!]:''}</h2>
        <Switch>
          <Match when={detail()==='personalization'}>
            <p>Make room for the way you work. These display preferences stay on this device.</p>
            <label class="settings-field">Density<select aria-label="Density" value={props.preferences.density} onChange={e=>props.onPreferencesChange({density:e.currentTarget.value as UiPreferences['density']})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
            <label class="settings-toggle"><span>Reduce motion<small id="settings-motion-help">Use immediate transitions throughout the app.</small></span><input aria-label="Reduce motion" aria-describedby="settings-motion-help" type="checkbox" checked={props.preferences.reduceMotion} onChange={e=>props.onPreferencesChange({reduceMotion:e.currentTarget.checked})}/></label>
          </Match>
          <Match when={detail()==='mindmap'}><Note title="Not available in this preview"><p>The visual workspace map is planned. Profiles and their local snapshots remain available in your workspace.</p></Note></Match>
          <Match when={detail()==='socks5'}><Note title="No proxy configured"><p>Custom SOCKS5 is not available yet. Browser launches remain blocked until OS routing is verified.</p><p>Use a profile’s VPN setup to save supported provider settings. Settings alone do not connect a tunnel.</p></Note></Match>
          <Match when={detail()==='email'}><Note title="No email connected"><p>This build uses a local encrypted workspace. Account sign-in and email linking are not available yet.</p></Note></Match>
          <Match when={detail()==='subscription'}><Note title="Local preview"><p>No paid plan is activated in this build. Billing and license activation are not connected.</p></Note></Match>
          <Match when={detail()==='trocador'}><Note title="Not connected"><p>Trocador exchange integration is not available in this preview. No exchange is connected to this workspace.</p></Note></Match>
          <Match when={detail()==='report'}><Note title="Browsing reports are off"><p>Automatic browsing reports are not available in this build. Opening Settings does not collect navigation history.</p></Note></Match>
          <Match when={detail()==='general'}><dl class="settings-facts"><div><dt>Application</dt><dd>Ecdys {props.version}</dd></div><div><dt>Platform</dt><dd>{props.platform}</dd></div><div><dt>Workspace</dt><dd>{props.unlocked?'Unlocked':'Locked'}</dd></div><div><dt>Data location</dt><dd>On this device</dd></div></dl></Match>
          <Match when={detail()==='notifications'}>
            <p>Choose whether to show optional in-app success messages. Errors and important cleanup warnings stay visible.</p>
            <label class="settings-toggle"><span>Show status messages<small id="settings-notifications-help">For saved changes and completed actions.</small></span><input aria-label="Show status messages" aria-describedby="settings-notifications-help" type="checkbox" checked={props.preferences.notifications} onChange={e=>props.onPreferencesChange({notifications:e.currentTarget.checked})}/></label>
            <p class="settings-detail-caption">Desktop push notifications are not enabled.</p>
          </Match>
          <Match when={detail()==='monero'}><Note title="Not connected"><p>Monero wallet and payment services are not connected in this preview.</p></Note></Match>
          <Match when={detail()==='security'}>
            <p>Lock the workspace to close its encrypted database and clear the app’s retained key.</p>
            <button class="settings-action" disabled={!props.unlocked||props.busy} onClick={props.onLock}>Lock workspace</button>
            <Note title="Automatic lock"><p>The workspace locks after 15 minutes without a workspace operation. This measures app operations, rather than mouse or keyboard activity.</p></Note>
            <Note title="Working browser files"><p>Saved snapshots and database records are encrypted. Browser working folders remain ordinary files; use your device’s disk encryption to protect them.</p></Note>
          </Match>
          <Match when={detail()==='cloud'}><Note title="Secure cloud storage is off"><p>This preview has no cloud sync service. Workspaces and snapshots stay on this device.</p></Note></Match>
          <Match when={detail()==='storage'}>
            <Show when={props.unlocked} fallback={<p>Unlock your workspace to see its profile and snapshot counts.</p>}><dl class="settings-facts"><div><dt>Profiles in workspace</dt><dd>{props.profileCount} / 99</dd></div><div><dt>Snapshots in selected profile</dt><dd>{props.snapshotCount}</dd></div></dl></Show>
            <Note title="Keep a complete backup"><p>Close Ecdys and back up the whole workspace folder, including workspace.json, workspace.db and profiles. Passphrases cannot be recovered.</p></Note>
          </Match>
          <Match when={detail()==='help'}>
            <Note title="Create a profile"><p>Unlock your encrypted workspace and choose New profile. Ecdys saves a baseline snapshot automatically.</p></Note>
            <Note title="Recover a saved state"><p>Select a profile, then use Check recovery to authenticate a snapshot before restoring. Restore always saves a rollback point first.</p></Note>
            <Note title="Browser launch is blocked"><p>Provider settings and registration do not establish a verified network route. Browser launch stays blocked until routing is ready.</p></Note>
          </Match>
          <Match when={detail()==='shortcuts'}><dl class="settings-facts settings-shortcuts"><div><dt>Open Settings</dt><dd><kbd>Ctrl / ⌘</kbd> + <kbd>,</kbd></dd></div><div><dt>Back or close Settings</dt><dd><kbd>Esc</kbd></dd></div><div><dt>Lock workspace</dt><dd><kbd>Ctrl / ⌘</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd></dd></div></dl><p class="settings-detail-caption">Lock is available when the desktop workspace is unlocked and no mutation is in progress.</p></Match>
        </Switch>
      </div>}>
        <nav class="settings-sections" aria-label="Settings sections"><For each={sections}>{section=><button aria-pressed={active()===section.id} onClick={()=>jump(section.id)}>{section.label}</button>}</For></nav>
        <Group id="environment" label="Customize" accessibleLabel="Environment"><Row id="personalization" icon="smile"/><Row id="mindmap" icon="map" value="Not available" accent/><Row id="socks5" icon="route" value="Not configured" dot/></Group>
        <Group id="account" label="Account"><Row id="email" icon="mail" value="No email connected"/><Row id="subscription" icon="subscription" value="Local preview"/><Row id="trocador" icon="exchange" value="Not connected"/></Group>
        <Group label="Activity"><Row id="report" icon="report" value="Off"/></Group>
        <Group id="appearance" label="Theme" accessibleLabel="Appearance">
          <label class="settings-row settings-select-row"><SettingsIcon name="moon"/><span class="settings-row-label">Appearance</span><select aria-label="Appearance" value={props.preferences.appearance} onChange={e=>props.onPreferencesChange({appearance:e.currentTarget.value as UiPreferences['appearance']})}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <label class="settings-row settings-select-row"><SettingsIcon name="palette"/><span class="settings-row-label">Accent colour</span><span class="settings-accent-swatch"/><select aria-label="Accent colour" value={props.preferences.accent} onChange={e=>props.onPreferencesChange({accent:e.currentTarget.value as UiPreferences['accent']})}><option value="crimson">Crimson</option><option value="sage">Sage</option><option value="indigo">Indigo</option></select></label>
        </Group>
        <Group id="app" label="App settings" accessibleLabel="App"><Row id="general" icon="general"/><Row id="notifications" icon="bell" value={props.preferences.notifications?'On':'Off'}/><Row id="monero" icon="monero" value="Not connected" dot/><Row id="security" icon="security"/><Row id="cloud" icon="cloud" value="Off" dot/><Row id="storage" icon="storage"/></Group>
        <Group id="help" label="Get help" accessibleLabel="Help"><Row id="help" icon="help"/><Row id="shortcuts" icon="keyboard"/></Group>
        <p class="settings-device-note">Device preferences save automatically.</p>
      </Show>
    </div>
  </dialog>;
}
