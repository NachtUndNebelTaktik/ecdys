import {createSignal,Match,Show,Switch} from 'solid-js';
import type {Profile,MergePreview} from '../../shared/src/model';
import DiffTable from './DiffTable';
export type BranchDialogState={kind:'create';profile:Profile}|{kind:'merge';preview:MergePreview}|{kind:'promote'|'discard';profile:Profile};
type Props={dialog:BranchDialogState;busy:boolean;error:string;onCancel:()=>void;onCreate:(name:string)=>void;onConfirm:()=>void};
export default function BranchDialog(props:Props) {
  const [name,setName]=createSignal('');
  const title=()=>props.dialog.kind==='create'?'Create an independent branch':props.dialog.kind==='merge'?'Review merge into parent':props.dialog.kind==='promote'?'Make this profile standalone?':'Discard this branch?';
  return <div class="modal-backdrop"><section class="modal branch-dialog" role="dialog" aria-modal="true" aria-labelledby="branch-title">
    <div class="eyebrow">PROFILE BRANCHES</div><h2 id="branch-title">{title()}</h2>
    <Switch>
      <Match when={props.dialog.kind==='create'}>
        <p class="muted">Copy the current settings, closed browser files and retained snapshot history into a separate profile. The parent stays unchanged. Branches count toward the 99-profile limit.</p>
        <form onSubmit={event=>{event.preventDefault();props.onCreate(name());}}>
          <label>Branch name<input autofocus required maxLength={64} value={name()} onInput={event=>setName(event.currentTarget.value)} placeholder="e.g. test-new-settings"/></label>
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
          <div class="modal-actions"><button class="secondary" disabled={props.busy} onClick={props.onCancel}>Cancel</button><button class="primary" disabled={props.busy||!preview().changes.length} onClick={props.onConfirm}>{props.busy?'Merging…':'Merge settings'}</button></div>
        </>}</Show>
      </Match>
      <Match when={props.dialog.kind==='promote'||props.dialog.kind==='discard'}>
        <p class="muted">{props.dialog.kind==='promote'?'Remove the parent link while keeping this profile, browser files and snapshot history. The parent is unchanged. Snapshot restore does not recreate ancestry.':'Permanently remove this branch, its browser files and its snapshots. The parent is unchanged. Promote or discard any child branches first.'}</p>
        <Show when={props.error}><p class="amber-text" role="alert">{props.error}</p></Show>
        <div class="modal-actions"><button class="secondary" disabled={props.busy} onClick={props.onCancel}>Cancel</button><button class={props.dialog.kind==='discard'?'danger':'primary'} disabled={props.busy} onClick={props.onConfirm}>{props.busy?'Working…':props.dialog.kind==='discard'?'Discard branch':'Promote profile'}</button></div>
      </Match>
    </Switch>
  </section></div>;
}
