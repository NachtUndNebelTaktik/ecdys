import {expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../packages/desktop/src/state-store';

// Deliberately opt-in: this uses an incompressible file at the advertised size
// limit and exercises real encryption, worker transfer, validation and extraction.
it.skipIf(process.env.STYG_LARGE_STATE_TEST!=='1')('round trips 64 MiB of incompressible browser data',async()=>{
  const root=await mkdtemp(join(tmpdir(),'styg-large-state-'));const store=new StateStore(root);
  try {
    const id=randomUUID(),sid=randomUUID(),op=randomUUID(),key=randomBytes(32),dir=await store.ensure(id);
    const bytes=randomBytes(64*1024*1024),expected=createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(dir,'binary-state'),bytes);bytes.fill(0);
    const saved=await store.capture(id,sid,key);expect(saved.stateBytes).toBe(64*1024*1024);
    await writeFile(join(dir,'binary-state'),'changed');
    await store.stage(id,op,sid,saved.envelope,key);await store.finishRestore(id,op);await store.cleanupRestore(id,op);
    const restored=await readFile(join(dir,'binary-state'));
    expect(createHash('sha256').update(restored).digest('hex')).toBe(expected);key.fill(0);restored.fill(0);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
},120000);
