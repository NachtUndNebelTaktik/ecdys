import {createSignal,Match,onCleanup,onMount,Show,Switch} from 'solid-js';
import type {Profile,MergePreview} from '../../shared/src/model';
import DiffTable from './DiffTable';
import './branch-dialog.css';
export type BranchDialogState={kind:'create';profile:Profile}|{kind:'merge';preview:MergePreview}|{kind:'promote'|'discard';profile:Profile};
type Props={dialog:BranchDialogState;busy:boolean;error:string;onCancel:()=>void;onCreate:(name:string)=>void;onConfirm:()=>void};
export default function BranchDialog(props:Props) {
  let modal!:HTMLDialogElement,cancel!:HTMLButtonElement,nameInput!:HTMLInputElement;
  const [name,setName]=createSignal('');
  const title=()=>props.dialog.kind==='create'?'Create an independent branch':props.dialog.kind==='merge'?'Review merge into parent':props.dialog.kind==='promote'?'Make this profile standalone?':'Discard this branch?';
  onMount(()=>{modal.showModal();(props.dialog.kind==='create'?nameInput:cancel)?.focus();});
  onCleanup(()=>modal.close());
  function containFocus(event:KeyboardEvent){
    if(event.key!=='Tab')return;
    const controls=Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1),focused=document.activeElement;
    if(!first){event.preventDefault();modal.focus();return;}
    if((event.shiftKey&&(focused===first||!modal.contains(focused)))||(!event.shiftKey&&(focused===last||!modal.contains(focused)))){
      event.preventDefault();(event.shiftKey?last:first)?.focus();
    }
  }
  return <dialog ref={modal} class="modal branch-dialog" tabIndex={-1} aria-labelledby="branch-title" onKeyDown={containFocus} onCancel={event=>{event.preventDefault();if(!props.busy)props.onCancel();}}>
    <div class="eyebrow">PROFILE BRANCHES</div><h2 id="branch-title">{title()}</h2>
    <Switch>
      <Match when={props.dialog.kind==='create'}>
        <p class="muted">Copy the current settings, closed browser files and retained snapshot history into a separate profile. The parent stays unchanged. Branches count toward the 99-profile limit.</p>
        <form onSubmit={event=>{event.preventDefault();if(!props.busy)props.onCreate(name());}}>
          <label>Branch name<input ref={nameInput} autofocus required maxLength={64} value={name()} onInput={event=>setName(event.currentTarget.value)} placeholder="e.g. test-new-settings"/></label>
          <p class="fine-print">Close the browser first. Re-encrypting snapshot history can take time; the fork point is pinned automatically.</p>
          <Show when={props.error}><p class="amber-text" role="alert">{props.error}</p></Show>
          <div class="modal-actions"><button class="secondary" type="button" disabled={props.busy} onClick={props.onCancel}>Cancel</button><button class="primary" type="submit" disabled={props.busy}>{props.busy?'Creating branch…':'Create branch'}</button></div>
        </form>
      </Match>
      <Match when={props.dialog.kind==='merge'}>
        <Show when={props.dialog.kind==='merge'?props.dialog.preview:undefined}>{preview=><>
          <p class="muted">Apply environment settings from <strong>{preview().branch.name}</strong> to <strong>{preview().parent.name}</strong>. The parent's name, tags and browser files stay unchanged. A configuration rollback snapshot is saved; the branch stays independent.</p>
          <DiffTable changes={preview().changes} emptyMessage="No environment differences to merge."/>
          <Show when={props.error}><p class="amber-text" role="alert">{props.error}</p></Show>
          <div class="modal-actions"><button ref={cancel} class="secondary" disabled={props.busy} onClick={props.onCancel}>Cancel</button><button class="primary" disabled={props.busy||!preview().changes.length} onClick={props.onConfirm}>{props.busy?'Merging…':'Merge settings'}</button></div>
        </>}</Show>
      </Match>
      <Match when={props.dialog.kind==='promote'||props.dialog.kind==='discard'}>
        <Show when={props.dialog.kind==='promote'||props.dialog.kind==='discard'?props.dialog.profile:undefined}>{profile=><p class="branch-action-target">Profile: <strong>{profile().name}</strong><br/><code>{profile().id}</code></p>}</Show>
        <p class="muted">{props.dialog.kind==='promote'?'Remove the parent link while keeping this profile, browser files and snapshot history. The parent is unchanged. Snapshot restore does not recreate ancestry.':'Remove this branch’s saved configuration, snapshots and browser working files from this workspace. No in-app Undo is available. External backups are not removed. This is logical deletion, not secure erasure. The parent is unchanged. Promote or discard any child branches first.'}</p>
        <p class="fine-print">Local workspace action. No data is sent to a remote service.</p>
        <Show when={props.error}><p class="amber-text" role="alert">{props.error}</p></Show>
        <div class="modal-actions"><button ref={cancel} class="secondary" disabled={props.busy} onClick={props.onCancel}>Cancel</button><button class={props.dialog.kind==='discard'?'danger':'primary'} disabled={props.busy} onClick={props.onConfirm}>{props.busy?props.dialog.kind==='discard'?'Discarding branch…':'Promoting profile…':props.dialog.kind==='discard'?'Discard branch':'Promote profile'}</button></div>
      </Match>
    </Switch>
  </dialog>;
}
