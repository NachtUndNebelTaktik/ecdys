import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const runner=resolve('scripts/routing-proof.mjs');
function run(args:string[],emptyPath=false){return spawnSync(process.execPath,[runner,...args],{cwd:'/tmp',encoding:'utf8',timeout:5000,env:emptyPath?{...process.env,PATH:'/styg-unavailable-executables'}:process.env});}
it('requires explicit execution and returns machine-readable blocked evidence',()=>{
  const result=run([]);expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({passed:false,status:'blocked',reason:'explicit_run_required'});
});
it('rejects unknown flags before attempting namespace setup',()=>{
  const result=run(['--run','--unknown']);expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({passed:false,status:'blocked',reason:'invalid_arguments'});
});
it('reports missing prerequisites as blocked, without claiming a proof passed',()=>{
  const result=run(['--run'],true);expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({passed:false,status:'blocked',reason:'missing_prerequisites',preflight:{status:'blocked'}});
});
it('reports fixture startup failure before printing a readiness record',()=>{
  const result=spawnSync('python3',[resolve('scripts/routing-fixture.py'),'serve','--bind','invalid'],{encoding:'utf8',timeout:3000});
  expect(result.status).not.toBe(0);expect(result.stdout).toBe('');expect(result.stderr).toContain('ValueError');
});
it.skipIf(process.env.STYG_PRIVILEGED_ROUTING_TEST!=='1')('executes the real dual-stack namespace proof on an administrator-equipped host',()=>{
  const result=spawnSync(process.execPath,[runner,'--run'],{encoding:'utf8',timeout:120000});
  expect(result.status,result.stderr||result.stdout).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({passed:true,status:'passed',evidence:{version:2},cleanupIssues:[]});
},125000);
