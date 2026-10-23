import {afterEach,expect,it} from 'vitest';
import {PassThrough} from 'node:stream';
import {CdpPipe} from '../packages/desktop/src/browser/cdp-pipe';
const pipes:CdpPipe[]=[];
function fixture(timeoutMs=100){const input=new PassThrough(),output=new PassThrough();const pipe=new CdpPipe(input,output,timeoutMs);pipes.push(pipe);return {input,output,pipe};}
afterEach(()=>{for(const pipe of pipes.splice(0))pipe.dispose();});
it('correlates fragmented UTF-8 frames and out-of-order responses',async()=>{
  const {input,output,pipe}=fixture();let sent='';input.on('data',chunk=>sent+=chunk.toString());
  const first=pipe.send('Browser.getVersion'),second=pipe.send('Runtime.evaluate',{expression:'1'},'page-session');
  const requests=sent.split('\0').filter(Boolean).map(frame=>JSON.parse(frame));
  expect(requests[1]).toMatchObject({method:'Runtime.evaluate',sessionId:'page-session'});
  output.write(JSON.stringify({id:requests[1].id,result:{value:2}})+'\0');
  const frame=Buffer.from(JSON.stringify({id:requests[0].id,result:{product:'Café'}})+'\0'),index=frame.indexOf(Buffer.from('é'))+1;
  output.write(frame.subarray(0,index));output.write(frame.subarray(index));
  await expect(first).resolves.toEqual({product:'Café'});await expect(second).resolves.toEqual({value:2});
});
it('rejects protocol errors and permits subsequent commands',async()=>{
  const {input,output,pipe}=fixture();const frames:string[]=[];input.on('data',chunk=>frames.push(chunk.toString()));
  const failed=pipe.send('Bad.command');output.write(JSON.stringify({id:1,error:{message:'Unsupported command'}})+'\0');await expect(failed).rejects.toThrow('Unsupported');
  const next=pipe.send('Browser.getVersion');output.write(JSON.stringify({id:2,result:{product:'Chrome'}})+'\0');await expect(next).resolves.toEqual({product:'Chrome'});
});
it('bounds missing responses and rejects commands after pipe closure',async()=>{
  const {output,pipe}=fixture(20);await expect(pipe.send('Browser.getVersion')).rejects.toThrow(/timed out/i);
  output.end();await new Promise(resolve=>setImmediate(resolve));await expect(pipe.send('Browser.getVersion')).rejects.toThrow(/closed/i);
});
it('rejects pending calls on malformed or oversized frames',async()=>{
  for(const frame of ['bad-json\0','x'.repeat(8*1024*1024+1)]){
    const {output,pipe}=fixture();const pending=pipe.send('Browser.getVersion');output.write(frame);await expect(pending).rejects.toThrow(/frame|JSON|limit/i);
  }
});
