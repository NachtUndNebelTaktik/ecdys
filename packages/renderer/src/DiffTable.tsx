import {For,Show} from 'solid-js';
import type {ConfigChange} from '../../shared/src/model';
const labels={name:'Name',tags:'Tag',timezone:'Timezone',language:'Language',screen:'Screen size',vpn:'VPN settings'};
export default function DiffTable(props:{changes:ConfigChange[];emptyMessage?:string}) {
  return <Show when={props.changes.length} fallback={<p class="diff-empty">{props.emptyMessage??'No configuration differences.'}</p>}>
    <div class="diff-scroll"><table class="diff-table" aria-label="Configuration changes">
      <thead><tr><th>Setting</th><th>Current</th><th>Proposed</th></tr></thead>
      <tbody><For each={props.changes}>{change=><tr class={`diff-${change.kind}`}>
        <th scope="row">{labels[change.field]}<small>{change.kind==='modified'?'Changed':change.kind==='added'?'Added':'Removed'}</small></th>
        <td>{change.before??'—'}</td><td>{change.after??'—'}</td>
      </tr>}</For></tbody>
    </table></div>
  </Show>;
}
