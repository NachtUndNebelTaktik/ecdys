import {For,Show} from 'solid-js';
import type {Profile,Snapshot} from '../../shared/src/model';
const time=(value:number)=>new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
type Props={profile:Profile;snapshots:Snapshot[];busy:boolean;onSave:()=>void;onPin:(snapshot:Snapshot)=>void;onRestore:(snapshot:Snapshot)=>void;canCreateBranch:boolean;parentName?:string;onCreateBranch:()=>void;onMerge:()=>void;onPromote:()=>void;onDiscard:()=>void};
export default function SnapshotPanel(props:Props) {
  return <aside class="detail-panel">
    <div class="detail-heading"><span class="eyebrow">PROFILE DETAILS</span><span>◈</span></div>
    <h2>{props.profile.name}</h2><p class="muted detail-desc">Snapshots and recovery</p>
    <Show when={props.profile.parentProfileId}><p class="branch-ancestry">Branch: {props.profile.branchName}<br/>Parent: {props.parentName??props.profile.parentProfileId}</p></Show>
    <div class="branch-actions">
      <button class="secondary wide" disabled={props.busy||!props.canCreateBranch} onClick={props.onCreateBranch}>Create branch</button>
      <Show when={props.profile.parentProfileId}>
        <button class="secondary wide" disabled={props.busy} onClick={props.onMerge}>Review merge</button>
        <button class="text-button wide" disabled={props.busy} onClick={props.onPromote}>Promote to standalone</button>
        <button class="text-button danger-text wide" disabled={props.busy} onClick={props.onDiscard}>Discard branch</button>
      </Show>
    </div>
    <div class="divider"/>
    <div class="detail-row"><span>Network route</span><span class="amber-text">Unverified</span></div>
    <div class="detail-row"><span>Session</span><span>Not running</span></div>
    <button class="secondary wide" disabled title="An OS-enforced route must be verified before launch">Launch blocked</button>
    <p class="fine-print">Each profile has a separate local data folder. Browser launch still requires verified routing.</p>
    <div class="divider"/>
    <h3>Snapshot history <span class="muted">{props.snapshots.length}</span></h3>
    <button class="secondary wide state-save-button" disabled={props.busy} onClick={props.onSave} aria-label="Save browser state">＋ Save browser state</button>
    <p class="fine-print">Close the browser before saving. Snapshots include up to 64 MiB of browser files. Recovery needs the same OS account and a compatible browser build. Protected cookies may require the original OS key store.</p>
    <p class="fine-print">Saved snapshots are encrypted. Browser working files are ordinary files; protect them with OS disk encryption.</p>
    <div class="timeline"><For each={props.snapshots}>{snapshot=><div class="timeline-item">
      <div class="timeline-dot"/>
      <div class="timeline-body">
        <strong>{snapshot.trigger.replaceAll('_',' ')}</strong>
        <small>{time(snapshot.timestamp)} · {(snapshot.size/1024).toFixed(1)} KiB</small>
        <small class={snapshot.hasBrowserState?'state-contents':'config-contents'}>{snapshot.hasBrowserState?`Config + browser state · ${snapshot.fileCount} ${snapshot.fileCount===1?'file':'files'}`:'Configuration only'}</small>
        <div class="snapshot-actions">
          <button disabled={props.busy} onClick={()=>props.onPin(snapshot)}>{snapshot.pinned?'◆ Pinned':'◇ Pin'}</button>
          <button disabled={props.busy} onClick={()=>props.onRestore(snapshot)}>Restore ↶</button>
        </div>
      </div>
    </div>}</For></div>
  </aside>;
}
