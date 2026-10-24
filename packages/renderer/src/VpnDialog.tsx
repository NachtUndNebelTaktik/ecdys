import {createSignal,For,Show} from 'solid-js';
import type {Profile} from '../../shared/src/model';
import type {CredentialPresence,RelayCatalog,VpnProviderType,VpnSettingsType} from '../../shared/src/vpn';
type Props={profile:Profile;credentials:CredentialPresence;busy:boolean;error:string;onClose:()=>void;onSave:(settings:VpnSettingsType)=>Promise<void>;onSaveCredential:(provider:VpnProviderType,account:string)=>Promise<void>;onClearCredential:(provider:VpnProviderType)=>Promise<void>;onCatalog:(provider:VpnProviderType)=>Promise<RelayCatalog|undefined>};
export default function VpnDialog(props:Props) {
  const [provider,setProvider]=createSignal(props.profile.vpn.provider);
  const [endpoint,setEndpoint]=createSignal(props.profile.vpn.endpoint??'');
  const [rotation,setRotation]=createSignal(props.profile.vpn.rotation);
  const [account,setAccount]=createSignal('');
  const [catalog,setCatalog]=createSignal<RelayCatalog>();
  const active=()=>provider()==='none'?undefined:provider() as VpnProviderType;
  return <div class="modal-backdrop"><section class="modal vpn-dialog" role="dialog" aria-modal="true" aria-labelledby="vpn-title">
    <div class="modal-top"><span class="eyebrow">NETWORK SETUP</span><button class="close-button" aria-label="Close VPN setup" disabled={props.busy} onClick={props.onClose}>×</button></div>
    <h2 id="vpn-title">VPN setup</h2><p class="muted">Configure routing for <strong>{props.profile.name}</strong>. Account storage and server selection are available; protected browsing is pending.</p>
    <label>VPN provider<select disabled={props.busy} value={provider()} onChange={e=>{setProvider(e.currentTarget.value as VpnSettingsType['provider']);setEndpoint('');setAccount('');setCatalog(undefined);}}><option value="none">Not configured</option><option value="mullvad">Mullvad</option><option value="ivpn">IVPN</option></select></label>
    <Show when={active()}>{current=><>
      <div class="vpn-account">
        <h3>Workspace account</h3><p class="fine-print">Shared by profiles using {current()==='ivpn'?'IVPN':'Mullvad'}. Encrypted locally; saved accounts are never shown again.</p>
        <p class="vpn-account-state">{props.credentials[current()]?'Account saved · authentication unverified':'No account saved'}</p>
        <label>Provider account ID<input type="password" autocomplete="off" spellcheck={false} maxLength={64} disabled={props.busy} value={account()} onInput={e=>setAccount(e.currentTarget.value)} placeholder={current()==='ivpn'?'i-XXXX-XXXX-XXXX':'16-digit account number'}/></label>
        <div class="vpn-buttons"><button class="secondary small" disabled={props.busy||!account().trim()} onClick={async()=>{const value=account();setAccount('');await props.onSaveCredential(current(),value);}}>Save account</button><Show when={props.credentials[current()]}><button class="text-button" disabled={props.busy} onClick={()=>void props.onClearCredential(current())}>Remove workspace account</button></Show></div>
      </div>
      <div class="vpn-catalog-heading"><h3>WireGuard endpoint</h3><button class="secondary small" disabled={props.busy} onClick={async()=>{const result=await props.onCatalog(current());if(result)setCatalog(result);}}>Load server list</button></div>
      <p class="fine-print">Loading the public server list contacts the provider without sending your account ID. Results are cached for one hour.</p>
      <label>Endpoint hostname<input disabled={props.busy} list="vpn-relays" maxLength={253} value={endpoint()} onInput={e=>setEndpoint(e.currentTarget.value)} placeholder={current()==='ivpn'?'at1.wg.ivpn.net':'se-got-wg-001'}/><datalist id="vpn-relays"><For each={catalog()?.relays??[]}>{relay=><option value={relay.hostname}>{relay.country} · {relay.city}{relay.load===null?'':` · ${relay.load}% load`}</option>}</For></datalist></label>
      <Show when={catalog()}>{loaded=><p class={loaded().stale?'amber-text fine-print':'fine-print'}>{loaded().relays.length} servers · checked {new Date(loaded().checkedAt).toLocaleString()}{loaded().stale?' · stale cache':''}. {loaded().warning??''}</p>}</Show>
      <p class="fine-print">You can enter a hostname offline. Selection does not verify reachability, account validity or a protected route. {current()==='mullvad'?'Mullvad does not publish live load in this catalog.':''}</p>
      <label>Rotation policy<select disabled={props.busy} value={rotation()} onChange={e=>setRotation(e.currentTarget.value as VpnSettingsType['rotation'])}><option value="manual">Manual only</option><option value="per_launch">Every launch</option><option value="every_5">Every 5 successful launches</option><option value="every_10">Every 10 successful launches</option><option value="hourly">Hourly</option><option value="daily">Daily</option></select></label>
      <p class="fine-print">The policy is saved for the routing supervisor. Automatic rotation is not active yet.</p>
    </>}</Show>
    <div class="preview-notice"><strong>Route lock required · launches blocked</strong><br/>Authentication, tunnel provisioning and OS route verification are pending. No connection test has run.</div>
    <Show when={props.error}><p class="amber-text" role="alert">{props.error}</p></Show>
    <div class="modal-actions"><button class="secondary" disabled={props.busy} onClick={props.onClose}>Cancel</button><button class="primary" disabled={props.busy} onClick={()=>void props.onSave({provider:provider(),endpoint:provider()==='none'?null:endpoint().trim()||null,rotation:provider()==='none'?'manual':rotation(),routeLock:true})}>Save VPN settings</button></div>
  </section></div>;
}
