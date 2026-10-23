import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const MAX_STATE_BYTES=64*1024*1024;
export const MAX_STATE_ENTRIES=4096;
export const RESTORE_MARKER='.styg-restore-token';
export const BROWSER_LOCKS=new Set(['singletonlock','singletonsocket','singletoncookie','lockfile']);
export type StateManifest={version:1;directories:string[];files:{path:string;data:string}[]};
export type DecodedManifest={directories:string[];files:{path:string;bytes:Buffer}[];stateBytes:number};

export function safeArchivePath(path:unknown):string {
  if(typeof path!=='string'||!path||Buffer.byteLength(path)>1024||path.includes('\\')||/[\x00-\x1f<>:"|?*]/.test(path)) throw new Error('Unsafe browser-state path');
  const segments=path.split('/');
  if(segments.length>32||segments.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)||p.toLowerCase()===RESTORE_MARKER)) throw new Error('Unsafe browser-state path');
  if(segments.length===1&&BROWSER_LOCKS.has(path.toLowerCase())) throw new Error('Close the browser before saving or restoring state (browser lock present)');
  return path;
}
export function validateManifest(value:unknown):DecodedManifest {
  const m=value as StateManifest;
  if(!m||typeof m!=='object'||m.version!==1||!Array.isArray(m.directories)||!Array.isArray(m.files)||Object.keys(m).sort().join(',')!=='directories,files,version') throw new Error('Invalid browser-state manifest');
  if(m.directories.length+m.files.length>MAX_STATE_ENTRIES) throw new Error('Browser state exceeds 4096 entries');
  const seen=new Set<string>(),directories=new Set<string>();
  const register=(value:unknown)=>{
    const path=safeArchivePath(value);const normalized=path.normalize('NFC').toLowerCase();
    if(seen.has(normalized))throw new Error('Duplicate browser-state path');
    seen.add(normalized);return path;
  };
  for(const path of m.directories)directories.add(register(path));
  let stateBytes=0;
  const files=m.files.map(file=>{
    if(!file||typeof file!=='object'||Object.keys(file).sort().join(',')!=='data,path'||typeof file.data!=='string'||file.data.length>Math.ceil(MAX_STATE_BYTES/3)*4)throw new Error('Invalid browser-state file');
    const path=register(file.path);const bytes=Buffer.from(file.data,'base64');
    if(bytes.toString('base64')!==file.data)throw new Error('Invalid browser-state file encoding');
    stateBytes+=bytes.length;if(stateBytes>MAX_STATE_BYTES)throw new Error('Browser state exceeds 64 MiB');
    return {path,bytes};
  });
  for(const path of [...directories,...files.map(file=>file.path)]) {
    const slash=path.lastIndexOf('/');if(slash!==-1&&!directories.has(path.slice(0,slash)))throw new Error('Missing browser-state parent directory');
  }
  return {directories:[...directories],files,stateBytes};
}
function encrypt(bytes:Buffer,key:Buffer,aad:Buffer):string {
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
  const body=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
function decrypt(text:string,key:Buffer,aad:Buffer):Buffer {
  const bytes=Buffer.from(text,'base64');if(bytes.length<28||bytes.toString('base64')!==text)throw new Error('Invalid browser-state ciphertext');
  const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAAD(aad);cipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]);
}
function wrappingKey(master:Buffer):Buffer {
  if(master.length!==32)throw new Error('Invalid workspace key');
  return Buffer.from(hkdfSync('sha256',master,Buffer.alloc(0),'styg/browser-state-wrapping/v1',32));
}
export function sealStateManifest(manifest:unknown,master:Buffer,profileId:string,snapshotId:string):Buffer {
  const json=Buffer.from(JSON.stringify(manifest));if(json.length>96*1024*1024)throw new Error('Browser-state manifest exceeds size limit');
  const key=randomBytes(32),wrapping=wrappingKey(master),aad=Buffer.from(JSON.stringify([1,'browser-state',profileId,snapshotId]));
  try {return Buffer.from(JSON.stringify({version:1,wrappedKey:encrypt(key,wrapping,aad),payload:encrypt(gzipSync(json,{level:9}),key,aad)}));}
  finally {key.fill(0);wrapping.fill(0);json.fill(0);}
}
export function openStateManifest(envelope:Buffer,master:Buffer,profileId:string,snapshotId:string):DecodedManifest {
  if(envelope.length>128*1024*1024)throw new Error('Browser-state envelope exceeds size limit');
  const object=JSON.parse(envelope.toString());
  if(!object||object.version!==1||typeof object.wrappedKey!=='string'||typeof object.payload!=='string'||Object.keys(object).sort().join(',')!=='payload,version,wrappedKey')throw new Error('Invalid browser-state envelope');
  const wrapping=wrappingKey(master),aad=Buffer.from(JSON.stringify([1,'browser-state',profileId,snapshotId]));let key:Buffer|undefined,plain:Buffer|undefined;
  try {key=decrypt(object.wrappedKey,wrapping,aad);plain=gunzipSync(decrypt(object.payload,key,aad),{maxOutputLength:96*1024*1024});return validateManifest(JSON.parse(plain.toString()));}
  finally {key?.fill(0);wrapping.fill(0);plain?.fill(0);}
}
