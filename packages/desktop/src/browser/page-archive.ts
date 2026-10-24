import {createHash} from 'node:crypto';

export type ArchiveTarget={targetId:string;title:string;url:string};
export type CapturedPage={bytes:Buffer;sha256:string};
export type ArchiveCommand=<T=unknown>(method:string,params?:Record<string,unknown>,sessionId?:string)=>Promise<T>;
export const MAX_PAGE_ARCHIVE_BYTES=4*1024*1024;
const TARGET_ID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX_TARGETS=100;
type PageTarget={view:ArchiveTarget;sourceUrl:string};

function pageTarget(value:unknown):PageTarget|undefined {
  if(!value||typeof value!=='object')return;
  const info=value as Record<string,unknown>;
  if(info.type!=='page'||typeof info.targetId!=='string'||!TARGET_ID.test(info.targetId)||typeof info.title!=='string'||typeof info.url!=='string'||Buffer.byteLength(info.url)>8192)return;
  let url:URL;try{url=new URL(info.url);}catch{return;}
  if(url.protocol!=='http:'&&url.protocol!=='https:')return;
  return {sourceUrl:info.url,view:{targetId:info.targetId,title:info.title.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,200),url:url.origin}};
}
export async function listArchivePages(command:ArchiveCommand):Promise<ArchiveTarget[]> {
  try {
    const result=await command<{targetInfos:unknown}>('Target.getTargets');
    if(!Array.isArray(result.targetInfos)||result.targetInfos.length>MAX_TARGETS)throw new Error();
    const seen=new Set<string>();
    return result.targetInfos.flatMap(info=>{const page=pageTarget(info);if(!page||seen.has(page.view.targetId))return [];seen.add(page.view.targetId);return [page.view];});
  }catch{throw new Error('Browser pages are unavailable for archiving');}
}
function mhtmlBytes(value:unknown):Buffer {
  if(typeof value!=='string'||!value||Buffer.byteLength(value)>MAX_PAGE_ARCHIVE_BYTES||value.includes('\0'))throw new Error();
  const separator=/\r?\n\r?\n/.exec(value);if(!separator||separator.index>16384)throw new Error();
  const headers=value.slice(0,separator.index).replace(/\r?\n[ \t]+/g,' ');
  if(!/^MIME-Version:[ \t]*1\.0[ \t]*$/im.test(headers)||!/^Content-Type:[ \t]*multipart\/related\b/im.test(headers))throw new Error();
  const contentType=/^Content-Type:([^\r\n]*)/im.exec(headers)?.[1]??'';
  const boundary=/;[ \t]*boundary[ \t]*=[ \t]*(?:"([^"\r\n]{1,200})"|([^;\s]{1,200}))/i.exec(contentType);
  const token=boundary?.[1]??boundary?.[2];if(!token||/[\x00-\x1f\x7f]/.test(token))throw new Error();
  const body=value.slice(separator.index+separator[0].length).replace(/^(?:\r?\n)+/,'');
  if(!body.startsWith(`--${token}\r\n`)&&!body.startsWith(`--${token}\n`))throw new Error();
  const closing=`--${token}--`,last=body.lastIndexOf(closing);
  if(last<0||(last>0&&body[last-1]!=='\n')||body.slice(last+closing.length).trim()||!/(?:^|\r?\n)Content-Type:[ \t]*text\/html\b/i.test(body))throw new Error();
  return Buffer.from(value,'utf8');
}
export async function captureArchivePage(command:ArchiveCommand,targetId:string):Promise<CapturedPage> {
  let bytes:Buffer|undefined;
  try {
    if(!TARGET_ID.test(targetId))throw new Error();
    const before=pageTarget((await command<{targetInfo:unknown}>('Target.getTargetInfo',{targetId})).targetInfo);
    if(!before||before.view.targetId!==targetId)throw new Error();
    const attached=await command<{sessionId:unknown}>('Target.attachToTarget',{targetId,flatten:true});
    if(typeof attached.sessionId!=='string'||!TARGET_ID.test(attached.sessionId))throw new Error();
    const sessionId=attached.sessionId;
    try {
      const captured=await command<{data:unknown}>('Page.captureSnapshot',{format:'mhtml'},sessionId);
      bytes=mhtmlBytes(captured.data);
      const after=pageTarget((await command<{targetInfo:unknown}>('Target.getTargetInfo',{targetId})).targetInfo);
      if(!after||after.view.targetId!==targetId||after.sourceUrl!==before.sourceUrl)throw new Error();
      return {bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
    }finally{await command('Target.detachFromTarget',{sessionId});}
  }catch {
    bytes?.fill(0);
    // CDP errors and document URLs may contain page content or authentication tokens.
    throw new Error('Page archive capture failed; the page may be unavailable, changed, invalid, or exceed the 4 MiB limit');
  }
}
