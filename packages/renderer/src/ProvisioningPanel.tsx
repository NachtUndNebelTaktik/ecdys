import {createEffect,createSignal,onCleanup,Show} from 'solid-js';
import type {Profile,RequestType} from '../../shared/src/model';
import type {RegistrationStatus,TunnelPreview,VpnProviderType} from '../../shared/src/vpn';
type Props={provider:VpnProviderType;profile:Profile;hasAccount:boolean;busy:boolean;invoke:<T>(request:RequestType)=>Promise<T>;onWorking:(working:boolean)=>void;onStatus:(status:RegistrationStatus|undefined)=>void};
export default function ProvisioningPanel(props:Props){
  const [status,setStatus]=createSignal<RegistrationStatus>();
  const [working,setWorking]=createSignal(false),[error,setError]=createSignal('');
  const [allowSlot,setAllowSlot]=createSignal(false),[allowRemoval,setAllowRemoval]=createSignal(false),[reviewed,setReviewed]=createSignal(false);
  const [preview,setPreview]=createSignal<TunnelPreview>();let epoch=0;
  let statusTimer:ReturnType<typeof setTimeout>|undefined;
  onCleanup(()=>{epoch++;clearTimeout(statusTimer);props.onWorking(false);});
  function showStatus(value:RegistrationStatus){setStatus(value);props.onStatus(value);props.onWorking(working()||!!value.inProgress);}
  async function readStatus(provider:VpnProviderType,version:number){
    try{
      const value=await props.invoke<RegistrationStatus>({action:'vpnRegistrationStatus',provider});
      if(epoch!==version)return;showStatus(value);
      if(value.inProgress)statusTimer=setTimeout(()=>void readStatus(provider,version),250);
    }catch{if(epoch===version)setError('Could not read saved provider setup. Close and reopen VPN setup to retry.');}
  }
  createEffect(()=>{
    clearTimeout(statusTimer);
    const provider=props.provider,version=++epoch;setStatus(undefined);props.onStatus(undefined);setPreview(undefined);setError('');setAllowSlot(false);setAllowRemoval(false);setReviewed(false);
    void readStatus(provider,version);
  });
  async function operate(action:'prepare'|'remove'|'reset'|'preview'){
    if(working())return;const version=epoch,provider=props.provider;setWorking(true);props.onWorking(true);setError('');setPreview(undefined);
    try{
      if(action==='preview'){
        const value=await props.invoke<TunnelPreview>({action:'previewVpnTunnel',id:props.profile.id});if(epoch===version)setPreview(value);
      }else{
        const request:RequestType=action==='prepare'?(status()?.phase==='registered'?{action:'recheckVpnRegistration',provider}:{action:'prepareVpnRegistration',provider,acknowledgeSlot:true}):action==='remove'?{action:'removeVpnRegistration',provider,acknowledgeRemoval:true}:{action:'resetUncertainVpnRegistration',provider,reviewedProviderAccount:true};
        const value=await props.invoke<RegistrationStatus>(request);if(epoch===version){setStatus(value);props.onStatus(value);setAllowSlot(false);setAllowRemoval(false);setReviewed(false);}
      }
    }catch(error){if(epoch===version){setError(error instanceof Error?error.message:'Provider operation failed');try{const value=await props.invoke<RegistrationStatus>({action:'vpnRegistrationStatus',provider});if(epoch===version){setStatus(value);props.onStatus(value);}}catch{}}}
    finally{if(epoch===version){setWorking(false);props.onWorking(!!status()?.inProgress);}}
  }
  const blocked=()=>props.busy||working()||!status()||!!status()?.inProgress;
  return <section class="vpn-account" aria-label="Provider registration">
    <h3>Provider registration</h3>
    <p class="fine-print">Preparing WireGuard sends the saved account and a new public key to {props.provider==='ivpn'?'IVPN':'Mullvad'}. It can use one device/session slot. Ecdys reuses that registration across this workspace's profiles.</p>
    <Show when={status()}>{saved=><>
      <p class="vpn-account-state">{saved().phase==='registered'?'WireGuard registration saved':saved().phase==='pending'?'Registration outcome uncertain':saved().phase==='draft'?'Local key saved · provider registration incomplete':'WireGuard not prepared'}</p>
      <Show when={saved().inProgress}><p class="fine-print" role="status">A provider operation is running. Status will refresh when it finishes.</p></Show>
      <Show when={saved().checkedAt}><p class="fine-print">Last account check: {saved().account} · {new Date(saved().checkedAt!).toLocaleString()}. Expires {saved().expiresAt?new Date(saved().expiresAt!).toLocaleString():'unknown'}.</p></Show>
      <Show when={saved().phase!=='registered'}><label class="consent-line"><input type="checkbox" checked={allowSlot()} disabled={blocked()} onChange={e=>setAllowSlot(e.currentTarget.checked)}/>I allow Ecdys to use a provider device/session slot.</label></Show>
      <div class="vpn-buttons"><button class="secondary small" disabled={blocked()||!props.hasAccount||(saved().phase!=='registered'&&!allowSlot())||(props.provider==='ivpn'&&saved().phase==='pending')} onClick={()=>void operate('prepare')}>{working()?'Working…':saved().phase==='registered'?'Recheck provider':props.provider==='mullvad'&&saved().phase==='pending'?'Reconcile registration':'Prepare WireGuard'}</button>
      <Show when={saved().phase==='registered'}><button class="secondary small" disabled={blocked()||props.profile.vpn.provider!==props.provider||!props.profile.vpn.endpoint} onClick={()=>void operate('preview')}>Preview saved endpoint</button></Show></div>
      <Show when={saved().phase==='registered'||saved().phase==='draft'}>
        <label class="consent-line"><input type="checkbox" checked={allowRemoval()} disabled={blocked()} onChange={e=>setAllowRemoval(e.currentTarget.checked)}/>Remove this workspace's Ecdys registration from the provider.</label>
        <button class="text-button danger-text" disabled={blocked()||!allowRemoval()} onClick={()=>void operate('remove')}>Remove registration</button>
      </Show>
      <Show when={saved().phase==='pending'}><p class="fine-print amber-text">A request may have reached the provider. {props.provider==='mullvad'?'Reconcile using the saved key, or review provider devices before resetting.':'Review and remove any uncertain Ecdys session using the official provider account tools before resetting. Automatic retries are blocked.'}</p>
        <label class="consent-line"><input type="checkbox" checked={reviewed()} disabled={blocked()} onChange={e=>setReviewed(e.currentTarget.checked)}/>I reviewed and cleaned up uncertain Ecdys devices/sessions in my provider account.</label>
        <button class="text-button danger-text" disabled={blocked()||!reviewed()} onClick={()=>void operate('reset')}>Reset reviewed local setup</button>
      </Show>
    </>}</Show>
    <Show when={preview()}>{plan=><div class="preview-notice" role="status"><strong>Tunnel preparation only · route blocked</strong><br/>{plan().hostname} → {plan().peerIp}:{plan().port}<br/>Interface addresses: {plan().interfaceAddresses.join(', ')}<br/>No interface, firewall rule or tunnel has been activated.</div>}</Show>
    <Show when={error()}><p class="amber-text fine-print" role="alert">{error()}</p></Show>
  </section>;
}
