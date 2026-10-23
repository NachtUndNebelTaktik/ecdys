import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { KdfParams, type KdfParameters } from '../../shared/src/model';
const resolveModule = createRequire(import.meta.url);

export async function deriveMasterKey(passphrase:string, salt:Buffer, params:KdfParameters):Promise<Buffer> {
  KdfParams.parse(params);
  const available=process.availableMemory();
  if(available>0 && params.memoryMiB*1024*1024+128*1024*1024>available) throw new Error('Not enough available memory for the selected key derivation setting');
  if(salt.length!==32) throw new Error('Invalid workspace salt');
  const moduleUrl=pathToFileURL(resolveModule.resolve('@noble/hashes/argon2.js')).href;
  return new Promise((resolve,reject)=>{
    const worker=new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      import(workerData.moduleUrl).then(({argon2id})=>{
        const key=argon2id(workerData.passphrase,new Uint8Array(workerData.salt),{
          m:workerData.params.memoryMiB*1024,t:workerData.params.iterations,p:1,dkLen:32
        });
        parentPort.postMessage(key); key.fill(0); parentPort.close();
      }).catch(()=>{parentPort.postMessage({error:true}); parentPort.close()});
    `,{eval:true,workerData:{moduleUrl,passphrase,salt,params}});
    let finished=false;
    const timeout=setTimeout(()=>{void worker.terminate(); reject(new Error('Key derivation timed out'));},120000);
    worker.once('message',(value)=>{finished=true; clearTimeout(timeout); if(value.error) reject(new Error('Unable to derive workspace key')); else resolve(Buffer.from(value));});
    worker.once('error',()=>{clearTimeout(timeout); reject(new Error('Unable to start key derivation worker'));});
    worker.once('exit',()=>{clearTimeout(timeout); if(!finished) reject(new Error('Key derivation worker stopped'));});
  });
}

function encrypt(data:Buffer,key:Buffer,aad:Buffer) {
  const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(aad);
  const body=Buffer.concat([cipher.update(data),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
function decrypt(value:string,key:Buffer,aad:Buffer) {
  const data=Buffer.from(value,'base64');
  if(data.length<28) throw new Error('Invalid encrypted snapshot');
  const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  cipher.setAAD(aad); cipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]);
}
function wrappingKey(master:Buffer) { return Buffer.from(hkdfSync('sha256',master,Buffer.alloc(0),'styg/snapshot-wrapping/v1',32)); }
export function sealSnapshot(data:unknown,master:Buffer,profileId:string,snapshotId:string):Buffer {
  const aad=Buffer.from(JSON.stringify([1,profileId,snapshotId]));
  const key=randomBytes(32); const wrapping=wrappingKey(master);
  try {
    const wrappedKey=encrypt(key,wrapping,aad);
    const payload=encrypt(gzipSync(JSON.stringify(data),{level:9}),key,aad);
    return Buffer.from(JSON.stringify({version:1,wrappedKey,payload}));
  } finally { key.fill(0); wrapping.fill(0); }
}
export function openSnapshot(envelope:Buffer,master:Buffer,profileId:string,snapshotId:string):unknown {
  if(envelope.length>2*1024*1024) throw new Error('Snapshot exceeds configuration size limit');
  const parsed=JSON.parse(envelope.toString());
  if(parsed.version!==1 || typeof parsed.wrappedKey!=='string' || typeof parsed.payload!=='string') throw new Error('Invalid snapshot format');
  const aad=Buffer.from(JSON.stringify([1,profileId,snapshotId])); const wrapping=wrappingKey(master); let key:Buffer|undefined;
  try {
    key=decrypt(parsed.wrappedKey,wrapping,aad);
    return JSON.parse(gunzipSync(decrypt(parsed.payload,key,aad),{maxOutputLength:1024*1024}).toString());
  } finally { key?.fill(0); wrapping.fill(0); }
}
