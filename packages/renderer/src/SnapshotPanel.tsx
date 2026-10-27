import {createEffect,createMemo,createSignal,For,onCleanup,Show} from 'solid-js';
import type {Profile,RecoveryRehearsalReport,Snapshot} from '../../shared/src/model';
import PageArchivePanel from './PageArchivePanel';
import type {SnapshotHistoryState} from './workspace-status';
const time=(value:number)=>new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
type Props={profile:Profile;snapshots:Snapshot[];historyState:SnapshotHistoryState;onRetryHistory:()=>void;busy:boolean;recoveryEpoch:number;onRehearse:(snapshot:Snapshot)=>Promise<RecoveryRehearsalReport>;onSave:()=>void;onPin:(snapshot:Snapshot)=>void;onRestore:(snapshot:Snapshot)=>void;canCreateBranch:boolean;parentName?:string;onCreateBranch:()=>void;onMerge:()=>void;onPromote:()=>void;onDiscard:()=>void};
export default function SnapshotPanel(props:Props) {
  const [checking,setChecking]=createSignal<string>();
  const [report,setReport]=createSignal<RecoveryRehearsalReport>();
  const [recoveryError,setRecoveryError]=createSignal('');
  const visibleSnapshots=createMemo(()=>props.historyState==='ready'?props.snapshots.filter(snapshot=>snapshot.profileId===props.profile.id):[]);
  const checkedSnapshot=createMemo(()=>visibleSnapshots().find(snapshot=>snapshot.id===report()?.snapshotId));
  let epoch=0;
  function invalidateRecovery(){epoch++;setChecking(undefined);setReport(undefined);setRecoveryError('');}
  createEffect(()=>{props.profile.id;props.recoveryEpoch;invalidateRecovery();});
  createEffect(()=>{
    const snapshotId=checking()??report()?.snapshotId;
    if(snapshotId&&!visibleSnapshots().some(snapshot=>snapshot.id===snapshotId))invalidateRecovery();
  });
  onCleanup(()=>{epoch++;});
  async function rehearse(snapshot:Snapshot) {
    if(props.busy||checking())return;
    const checkEpoch=++epoch,scope=props.recoveryEpoch,profileId=props.profile.id;
    const isCurrent=()=>checkEpoch===epoch&&scope===props.recoveryEpoch&&profileId===props.profile.id&&visibleSnapshots().some(item=>item.id===snapshot.id);
    setReport(undefined);setRecoveryError('');setChecking(snapshot.id);
    try {
      const result=await props.onRehearse(snapshot);
      if(isCurrent()&&result.profileId===profileId&&result.snapshotId===snapshot.id)setReport(result);
    }catch{
      if(isCurrent())setRecoveryError('Unable to check recovery. Preserve the workspace and try another saved snapshot.');
    }finally{
      if(isCurrent())setChecking(undefined);
    }
  }
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
    <PageArchivePanel profileId={props.profile.id} disabled={props.busy} scope={props.recoveryEpoch}/>
    <div class="divider"/>
    <h3>Snapshot history <span class="muted">{props.historyState==='ready'?visibleSnapshots().length:'Unknown'}</span></h3>
    <Show when={props.historyState==='loading'}><p class="fine-print" role="status">Loading snapshot history.</p></Show>
    <Show when={props.historyState==='error'}><p class="fine-print" role="alert">Snapshot history could not be read. Its contents and count are unknown. Retry to read this profile's history again.</p><button class="secondary wide" disabled={props.busy} onClick={props.onRetryHistory}>Retry snapshot history</button></Show>
    <Show when={props.historyState==='unknown'}><p class="fine-print">Snapshot history has not been read.</p></Show>
    <button class="secondary wide state-save-button" disabled={props.busy} onClick={props.onSave} aria-label="Save browser state">＋ Save browser state</button>
    <p class="fine-print">Close the browser before saving. Snapshots include up to 64 MiB of browser files. Recovery needs the same OS account and a compatible browser build. Protected cookies may require the original OS key store.</p>
    <p class="fine-print">Saved snapshots are encrypted. Browser working files are ordinary files; protect them with OS disk encryption.</p>
    <Show when={checking()}><p class="recovery-progress" role="status">Checking saved contents…</p></Show>
    <Show when={recoveryError()}><p class="recovery-error" role="alert">{recoveryError()}</p></Show>
    <Show when={report()}>{result=><section class="recovery-report" role="status" aria-label="Recovery check report">
      <h3>Recovery check complete</h3>
      <Show when={checkedSnapshot()}>{snapshot=><p>Snapshot: {snapshot().trigger.replaceAll('_',' ')} · {time(snapshot().timestamp)}</p>}</Show>
      <p class="recovery-coverage">{result().coverage==='configuration_only'?'Configuration only · no browser files':'Configuration + browser state'}</p>
      <p>{result().fileCount} {result().fileCount===1?'file':'files'} · {result().directoryCount} {result().directoryCount===1?'directory':'directories'} · {result().stateBytes} bytes</p>
      <p>Checked <time datetime={new Date(result().checkedAt).toISOString()}>{time(result().checkedAt)}</time></p>
      <Show when={result().browserVersion}><p>Saved browser: {result().browserVersion}</p></Show>
      <p>Saved contents authenticated and readable.</p>
      <p class="recovery-limitations">No browser was launched and no files were extracted to disk. Browser and OS compatibility, protected cookies and routing were not tested.</p>
    </section>}</Show>
    <div class="timeline"><For each={visibleSnapshots()}>{snapshot=><div class="timeline-item">
      <div class="timeline-dot"/>
      <div class="timeline-body">
        <strong>{snapshot.trigger.replaceAll('_',' ')}</strong>
        <small>{time(snapshot.timestamp)} · {(snapshot.size/1024).toFixed(1)} KiB</small>
        <small class={snapshot.hasBrowserState?'state-contents':'config-contents'}>{snapshot.hasBrowserState?`Config + browser state · ${snapshot.fileCount} ${snapshot.fileCount===1?'file':'files'}`:'Configuration only'}</small>
        <div class="snapshot-actions">
          <button disabled={props.busy} onClick={()=>props.onPin(snapshot)}>{snapshot.pinned?'◆ Pinned':'◇ Pin'}</button>
          <button disabled={props.busy} onClick={()=>props.onRestore(snapshot)}>Restore ↶</button>
          <button disabled={props.busy||!!checking()} onClick={()=>void rehearse(snapshot)}>{checking()===snapshot.id?'Checking…':'Check recovery'}</button>
        </div>
      </div>
    </div>}</For></div>
  </aside>;
}
