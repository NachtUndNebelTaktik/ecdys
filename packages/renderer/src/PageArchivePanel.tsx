import {createEffect,createSignal,For,onCleanup,Show} from 'solid-js';
import type {ManagedSession,PageArchiveTarget,PageArchiveSaveResult,RequestType} from '../../shared/src/model';

export default function PageArchivePanel(props:{profileId:string;disabled:boolean;scope:number}) {
  const [expanded,setExpanded]=createSignal(false),[working,setWorking]=createSignal(false);
  const [pages,setPages]=createSignal<PageArchiveTarget[]>([]),[target,setTarget]=createSignal('');
  const [sessionId,setSessionId]=createSignal(''),[message,setMessage]=createSignal(''),[digest,setDigest]=createSignal('');
  let epoch=0;
  const reset=()=>{epoch++;setWorking(false);setPages([]);setSessionId('');setTarget('');setMessage('');setDigest('');};
  createEffect(()=>{props.profileId;props.scope;reset();setExpanded(false);});
  onCleanup(()=>{epoch++;});
  async function invoke<T>(request:RequestType):Promise<T> {
    if(!window.styg)throw new Error('Open Ecdys in Electron to save page archives.');
    const result=await window.styg.invoke<T>(request);if(!result.ok)throw new Error(result.error);return result.value;
  }
  async function load() {
    if(working()||props.disabled)return;
    reset();setExpanded(true);setWorking(true);
    const version=epoch,id=props.profileId;
    try {
      const sessions=await invoke<ManagedSession[]>({action:'sessions'});
      if(version!==epoch)return;
      const active=sessions.find(item=>item.profileId===id&&item.status==='active');
      if(!active){setMessage('Page capture needs an active profile session. Browser launches are currently blocked until OS routing is verified.');return;}
      const available=await invoke<PageArchiveTarget[]>({action:'pageArchiveTargets',id,sessionId:active.id});
      if(version!==epoch)return;
      setSessionId(active.id);setPages(available);setTarget(available[0]?.targetId??'');
      if(!available.length)setMessage('No HTTP or HTTPS pages are available in this profile session.');
    }catch(error){if(version===epoch)setMessage(error instanceof Error?error.message:'The page list could not be loaded.');}
    finally{if(version===epoch)setWorking(false);}
  }
  async function save() {
    if(working()||props.disabled||!target()||!sessionId())return;
    const version=epoch,id=props.profileId;
    setWorking(true);setMessage('');setDigest('');
    try {
      const result=await invoke<PageArchiveSaveResult>({action:'savePageArchive',id,sessionId:sessionId(),targetId:target()});
      if(version!==epoch)return;
      if(result.saved){setMessage(`Archive saved · ${(result.size/1024).toFixed(1)} KiB`);setDigest(result.sha256);}
      else setMessage('Save canceled.');
    }catch(error){if(version===epoch)setMessage(error instanceof Error?error.message:'The page archive could not be saved.');}
    finally{if(version===epoch)setWorking(false);}
  }
  return <section class="page-archive-tool" aria-label="Page archive tool">
    <button class="secondary wide" aria-describedby="page-archive-boundary" disabled={props.disabled||working()} onClick={()=>void load()}>{working()?'Preparing archive…':'Page archive (.mhtml)'}</button>
    <p id="page-archive-boundary" class="fine-print">Host operation · local plaintext export. Saving writes page content and source URLs to a file you choose. This action does not upload the archive.</p>
    <Show when={expanded()}>
      <p class="fine-print">Save a loaded page and its available resources as one MHTML file. This is Chromium archiving; scripts, live media and unsaved form state may not be preserved.</p>
      <p class="fine-print amber-text">Exports contain unencrypted page content and source URLs. Review before sharing. Maximum archive: 4 MiB.</p>
      <Show when={pages().length}><label>Page to save<select disabled={working()} value={target()} onChange={e=>{setTarget(e.currentTarget.value);setMessage('');setDigest('');}}><For each={pages()}>{page=><option value={page.targetId}>{page.title||page.url} · {page.url}</option>}</For></select></label></Show>
      <Show when={message()}><p class="fine-print" role="status">{message()}</p></Show>
      <Show when={digest()}><p class="fine-print archive-digest">SHA-256<br/>{digest()}</p></Show>
      <div class="snapshot-actions"><button disabled={props.disabled||working()||!target()} onClick={()=>void save()}>Save archive…</button><button disabled={working()} onClick={()=>{reset();setExpanded(false);}}>Close archive tool</button></div>
    </Show>
  </section>;
}
