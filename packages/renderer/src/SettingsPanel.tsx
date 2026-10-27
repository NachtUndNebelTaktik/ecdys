import {createEffect,createSignal,For,onCleanup,onMount,Show,Switch,Match,type JSX} from 'solid-js';
import {DEFAULT_UI_PREFERENCES,type UiPreferences} from './preferences';
import SettingsIcon,{type SettingsIconName} from './SettingsIcon';
import './settings.css';

type Detail='personalization'|'mindmap'|'socks5'|'email'|'subscription'|'trocador'|'report'|'general'|'notifications'|'monero'|'security'|'cloud'|'storage'|'data'|'help'|'shortcuts';
type Section='environment'|'account'|'appearance'|'app'|'help';
type Setting=Detail|'appearance'|'accent';
const sections:{id:Section;label:string;railLabel:string;rows:Setting[]}[]=[
  {id:'environment',label:'Environment',railLabel:'Your environment',rows:['personalization','mindmap','socks5']},
  {id:'account',label:'Account',railLabel:'Account',rows:['email','subscription','trocador','report']},
  {id:'appearance',label:'Appearance',railLabel:'Appearance',rows:['appearance','accent']},
  {id:'app',label:'App',railLabel:'App settings',rows:['general','notifications','monero','security','cloud','storage','data']},
  {id:'help',label:'Help',railLabel:'Get help',rows:['help','shortcuts']},
];
const titles:Record<Setting,string>={personalization:'Personalization',mindmap:'Mindmap',socks5:'SOCKS5',email:'Email',subscription:'Subscription',trocador:'Trocador',report:'Browsing report',appearance:'Appearance',accent:'Accent colour',general:'General',notifications:'Notifications',monero:'Monero',security:'Security',cloud:'Secure cloud storage',storage:'Storage',data:'Data controls',help:'Help centre',shortcuts:'Keyboard shortcuts'};
const accents:{value:UiPreferences['accent'];label:string}[]=[{value:'crimson',label:'Crimson'},{value:'rose',label:'Rose'},{value:'amber',label:'Amber'},{value:'teal',label:'Teal'},{value:'blue',label:'Blue'},{value:'violet',label:'Violet'}];
const label=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
type Props={preferences:UiPreferences;onPreferencesChange:(patch:Partial<UiPreferences>)=>void;persistenceAvailable:boolean;onClose:()=>void;onLock:()=>void;unlocked:boolean;busy:boolean;profileCount:number;snapshotCount:number;platform:string;version:string};

export default function SettingsPanel(props:Props) {
  let dialog!:HTMLDialogElement,scroll!:HTMLDivElement,back!:HTMLButtonElement;
  const [detail,setDetail]=createSignal<Detail>();
  const [active,setActive]=createSignal<Section>('environment');
  const [query,setQuery]=createSignal('');
  let previousRow:Detail|undefined;
  let navigationAnchor:{id:Section;top:number}|undefined;
  const values=():Partial<Record<Setting,string>>=>({mindmap:'Not available',socks5:'Direct',email:'No email connected',subscription:'Local preview',trocador:'Not connected',report:'Off',appearance:label(props.preferences.appearance),accent:label(props.preferences.accent),notifications:props.preferences.notifications?'On':'Off',monero:'Not connected',cloud:'Off',shortcuts:'?'});
  const matches=(id:Setting)=>`${titles[id]} ${values()[id]??''}`.toLowerCase().includes(query().trim().toLowerCase());
  const hasMatches=()=>sections.some(section=>section.rows.some(matches));
  function focusSearch(){
    const input=Array.from(dialog.querySelectorAll<HTMLInputElement>('input[type="search"]')).find(element=>element.getClientRects().length>0);
    input?.focus();input?.select();
  }
  function keyboard(event:KeyboardEvent){
    if(event.key==='Escape'&&query()&&!detail()){
      event.preventDefault();event.stopPropagation();setQuery('');focusSearch();return;
    }
    const editing=event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!editing){
      event.preventDefault();setDetail(undefined);queueMicrotask(focusSearch);return;
    }
    if(event.key!=='Tab')return;
    const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1),focused=document.activeElement;
    if(first&&((event.shiftKey&&(focused===first||!dialog.contains(focused)))||(!event.shiftKey&&(focused===last||!dialog.contains(focused))))){event.preventDefault();(event.shiftKey?last:first)?.focus();}
  }
  function openDetail(id:Detail){previousRow=id;setDetail(id);scroll.scrollTop=0;}
  function closeDetail(){setDetail(undefined);queueMicrotask(()=>dialog.querySelector<HTMLButtonElement>(`[data-setting-row="${previousRow}"]`)?.focus());}
  function syncActiveSection(){
    if(detail())return;
    // A short section can share the final viewport with its neighbours. Keep
    // an explicit navigation choice until the content actually moves again.
    if(navigationAnchor&&Math.abs(scroll.scrollTop-navigationAnchor.top)<1){setActive(navigationAnchor.id);return;}
    navigationAnchor=undefined;
    const visible=sections.map(section=>({section,element:dialog.querySelector<HTMLElement>(`#settings-${section.id}`)})).filter(item=>item.element&&!item.element.hidden);
    if(!visible.length)return;
    let current=visible[0];
    const threshold=scroll.getBoundingClientRect().top+Math.max(90,parseFloat(getComputedStyle(scroll).scrollPaddingTop)+16);
    for(const item of visible)if(item.element!.getBoundingClientRect().top<=threshold)current=item;
    if(scroll.scrollTop>0&&scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-2)current=visible.at(-1)!;
    setActive(current.section.id);
  }
  function jump(id:Section){
    setDetail(undefined);setQuery('');
    queueMicrotask(()=>{
      const target=dialog.querySelector<HTMLElement>(`#settings-${id}`);
      if(!target)return;
      const inset=parseFloat(getComputedStyle(scroll).scrollPaddingTop);
      scroll.scrollTo({top:id==='environment'?0:target.getBoundingClientRect().top-scroll.getBoundingClientRect().top+scroll.scrollTop-inset,behavior:'instant'});
      navigationAnchor={id,top:scroll.scrollTop};
      setActive(id);
    });
  }
  createEffect(()=>{if(detail())queueMicrotask(()=>back?.focus());});
  createEffect(()=>{query();navigationAnchor=undefined;queueMicrotask(syncActiveSection);});
  onMount(()=>{dialog.showModal();});
  onCleanup(()=>{dialog.close();});
  const Dot=(dot:{on?:boolean})=><span aria-hidden="true" class={`settings-state-dot ${dot.on?'is-on':''}`}/>;
  const Tile=(tile:{icon:SettingsIconName})=><span class="settings-icon-tile"><SettingsIcon name={tile.icon}/></span>;
  const Row=(row:{id:Detail;icon:SettingsIconName;dot?:boolean})=><button type="button" class="settings-row" hidden={!matches(row.id)} data-setting-row={row.id} onClick={()=>openDetail(row.id)}>
    <Tile icon={row.icon}/><span class="settings-row-label">{titles[row.id]}</span>
    <Show when={values()[row.id]}><span class="settings-row-value"><Show when={row.dot}><Dot on={row.id==='notifications'&&props.preferences.notifications}/></Show>{values()[row.id]}</span></Show>
    <SettingsIcon name="next" class="settings-chevron"/>
  </button>;
  const Group=(group:{id:Section;label:string;accessibleLabel?:string;children:JSX.Element})=><section id={`settings-${group.id}`} class="settings-section" hidden={!sections.find(section=>section.id===group.id)!.rows.some(matches)}>
    <h2 aria-label={group.accessibleLabel??group.label}>{group.label}</h2><div class="settings-card">{group.children}</div>
  </section>;
  const Note=(note:{title:string;children:JSX.Element})=><div class="settings-note"><h3>{note.title}</h3><div>{note.children}</div></div>;
  const Search=()=><label class="settings-search"><SettingsIcon name="search"/><input type="search" aria-label="Search settings" placeholder="Search settings" autocomplete="off" spellcheck={false} value={query()} onInput={event=>{setQuery(event.currentTarget.value);setDetail(undefined);scroll.scrollTop=0;}}/><kbd>/</kbd></label>;
  const Navigation=(nav:{compact?:boolean})=><nav class={`settings-sections ${nav.compact?'is-compact':''}`} aria-label="Settings sections">
    <For each={sections}>{section=><><Show when={!nav.compact&&(section.id==='environment'||section.id==='help')}><div class="settings-nav-label">{section.id==='help'?'Support':'Workspace'}</div></Show><button aria-label={section.label} aria-pressed={active()===section.id} aria-current={active()===section.id?'location':undefined} onClick={()=>jump(section.id)}><span aria-hidden="true" class="settings-nav-dot"/>{nav.compact?section.label:section.railLabel}</button></>}</For>
  </nav>;
  return <dialog ref={dialog} class="settings-dialog" aria-labelledby="settings-title" onKeyDown={keyboard} onCancel={event=>{event.preventDefault();detail()?closeDetail():props.onClose();}}>
    <div class="settings-shell">
      <aside class="settings-rail">
        <div class="settings-brand"><span class="settings-brand-mark">e</span><span>EcDys<small>Settings</small></span></div>
        <Search/><Navigation/>
        <div class="settings-rail-foot"><span><Dot on={props.unlocked}/>{props.unlocked?'Vault unlocked':'Vault locked'}</span><span>v{props.version}</span></div>
      </aside>
    <div ref={scroll} class="settings-scroll" onScroll={syncActiveSection}>
      <header class="settings-header"><div><p class="settings-kicker">YOUR ENVIRONMENT, YOUR CONTROL</p><h1 id="settings-title">Settings</h1><p class="settings-intro">Device preferences and workspace configuration. Settings stay on this device. Cloud sync is off.</p></div><button class="settings-close" aria-label="Close settings" autofocus onClick={props.onClose}><SettingsIcon name="close"/></button></header>
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
          <Match when={detail()==='socks5'}><Note title="No proxy configured"><p>Direct means no SOCKS5 proxy is configured. Custom SOCKS5 is not available yet. Browser launches remain blocked until OS routing is verified.</p><p>Use a profile’s VPN setup to save supported provider settings. Settings alone do not connect a tunnel.</p></Note></Match>
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
          <Match when={detail()==='data'}>
            <Note title="Device preferences only"><p>This device stores appearance, accent, spacing, motion and optional status-message preferences. Search text is not saved. No navigation history, account details or credentials are stored with these preferences.</p></Note>
            <p>Reset these five preferences to their defaults. Your encrypted workspace, profiles and snapshots are preserved.</p>
            <button class="settings-action" onClick={()=>props.onPreferencesChange({...DEFAULT_UI_PREFERENCES})}>Reset device preferences</button>
          </Match>
          <Match when={detail()==='storage'}>
            <Show when={props.unlocked} fallback={<p>Unlock your workspace to see its profile and snapshot counts.</p>}><dl class="settings-facts"><div><dt>Profiles in workspace</dt><dd>{props.profileCount} / 99</dd></div><div><dt>Snapshots in selected profile</dt><dd>{props.snapshotCount}</dd></div></dl></Show>
            <Note title="Keep a complete backup"><p>Close Ecdys and back up the whole workspace folder, including workspace.json, workspace.db and profiles. Passphrases cannot be recovered.</p></Note>
          </Match>
          <Match when={detail()==='help'}>
            <Note title="Create a profile"><p>Unlock your encrypted workspace and choose New profile. Ecdys saves a baseline snapshot automatically.</p></Note>
            <Note title="Recover a saved state"><p>Select a profile, then use Check recovery to authenticate a snapshot before restoring. Restore always saves a rollback point first.</p></Note>
            <Note title="Browser launch is blocked"><p>Provider settings and registration do not establish a verified network route. Browser launch stays blocked until routing is ready.</p></Note>
          </Match>
          <Match when={detail()==='shortcuts'}><dl class="settings-facts settings-shortcuts"><div><dt>Open Settings</dt><dd><kbd>Ctrl / ⌘</kbd> + <kbd>,</kbd></dd></div><div><dt>Search Settings</dt><dd><kbd>/</kbd></dd></div><div><dt>Clear search, back or close</dt><dd><kbd>Esc</kbd></dd></div><div><dt>Lock workspace</dt><dd><kbd>Ctrl / ⌘</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd></dd></div></dl><p class="settings-detail-caption">Search shortcuts apply inside Settings and leave text fields alone. Lock is available when the desktop workspace is unlocked and no mutation is in progress.</p></Match>
        </Switch>
      </div>}>
        <div class="settings-compact-tools"><Search/><Navigation compact/></div>
        <div class="settings-content-grid"><div class="settings-panes">
        <Group id="environment" label="Customize" accessibleLabel="Environment"><Row id="personalization" icon="smile"/><Row id="mindmap" icon="map"/><Row id="socks5" icon="route" dot/></Group>
        <Group id="account" label="Account"><Row id="email" icon="mail"/><Row id="subscription" icon="subscription" dot/><Row id="trocador" icon="exchange"/><Row id="report" icon="report"/></Group>
        <Group id="appearance" label="Theme" accessibleLabel="Appearance">
          <label class="settings-row settings-select-row" hidden={!matches('appearance')}><Tile icon="moon"/><span class="settings-row-label">Appearance</span><span class="settings-row-value">{values().appearance}</span><SettingsIcon name="updown" class="settings-chevron"/><select aria-label="Appearance" value={props.preferences.appearance} onChange={e=>props.onPreferencesChange({appearance:e.currentTarget.value as UiPreferences['appearance']})}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <label class="settings-row settings-select-row" hidden={!matches('accent')}><Tile icon="palette"/><span class="settings-row-label">Accent colour</span><span class="settings-row-value"><span class="settings-accent-swatch"/>{values().accent}</span><SettingsIcon name="updown" class="settings-chevron"/><select aria-label="Accent colour" value={props.preferences.accent} onChange={e=>props.onPreferencesChange({accent:e.currentTarget.value as UiPreferences['accent']})}><For each={accents}>{accent=><option value={accent.value}>{accent.label}</option>}</For><Show when={props.preferences.accent==='sage'||props.preferences.accent==='indigo'}><option value={props.preferences.accent}>{label(props.preferences.accent)} (saved)</option></Show></select></label>
        </Group>
        <Group id="app" label="App settings" accessibleLabel="App"><Row id="general" icon="general"/><Row id="notifications" icon="bell" dot/><Row id="monero" icon="monero" dot/><Row id="security" icon="security"/><Row id="cloud" icon="cloud" dot/><Row id="storage" icon="storage"/><Row id="data" icon="lock"/></Group>
        <Group id="help" label="Get help" accessibleLabel="Help"><Row id="help" icon="help"/><Row id="shortcuts" icon="keyboard"/></Group>
        <Show when={!hasMatches()}><p class="settings-empty" role="status">No settings match</p></Show>
        <p class="settings-device-note">{props.persistenceAvailable?'Device preferences save automatically.':'Device preferences are temporary for this session.'}</p>
        </div><aside class="settings-state" aria-label="Current state">
          <div class="settings-state-panel"><h2>Current state</h2><dl>
            <div><dt>Appearance</dt><dd>{values().appearance}</dd></div><div><dt>Accent</dt><dd>{values().accent}</dd></div>
            <div><dt>Vault</dt><dd><Dot on={props.unlocked}/>{props.unlocked?'Unlocked':'Locked'}</dd></div>
            <div><dt>SOCKS5</dt><dd><Dot/>Direct</dd></div><div><dt>Routing</dt><dd>Blocked</dd></div>
            <div><dt>Monero</dt><dd><Dot/>Not connected</dd></div><div><dt>Cloud storage</dt><dd><Dot/>Off</dd></div><div><dt>Build</dt><dd>{props.version}</dd></div>
          </dl></div>
          <div class="settings-state-panel"><h2>On this device</h2><p>Preferences are stored per device. <strong>Cloud sync is off.</strong> Workspaces and snapshots stay on this device.</p></div>
        </aside></div>
      </Show>
    </div>
    </div>
  </dialog>;
}
