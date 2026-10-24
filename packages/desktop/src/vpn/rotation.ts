import {Rotation,type Relay} from '../../../shared/src/vpn';
import {z} from 'zod';
type Input={policy:z.infer<typeof Rotation>;successfulLaunches:number;lastRotatedAt:number|null;now:number;current:string|null;relays:Relay[];manual?:boolean};
export function planRotation(input:Input):{due:boolean;endpoint:string|null;warning?:string} {
  const policy=Rotation.parse(input.policy);
  const count=z.number().int().nonnegative().parse(input.successfulLaunches);
  const now=z.number().nonnegative().parse(input.now);
  const last=input.lastRotatedAt===null?null:z.number().nonnegative().parse(input.lastRotatedAt);
  const interval=policy==='hourly'?3600000:86400000;
  const due=!!input.manual||(policy!=='manual'&&(!input.current||policy==='per_launch'||
    ((policy==='every_5'||policy==='every_10')&&count>0&&count%(policy==='every_5'?5:10)===0)||
    ((policy==='hourly'||policy==='daily')&&(last===null||now-last>=interval))));
  if(!due)return {due:false,endpoint:input.current};
  const candidates=input.relays.filter(r=>r.hostname!==input.current).sort((a,b)=>(a.load??Infinity)-(b.load??Infinity)||a.hostname.localeCompare(b.hostname));
  if(!candidates.length)return {due:true,endpoint:input.current,warning:'No different endpoint is available. Keep the current selection and refresh the catalog.'};
  return {due:true,endpoint:candidates[0].hostname};
}
