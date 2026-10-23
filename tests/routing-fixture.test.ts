import {afterEach,beforeAll,afterAll,expect,it} from 'vitest';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {createSocket} from 'node:dgram';
import {createServer} from 'node:net';
import {once} from 'node:events';
const exec=promisify(execFile),fixture='scripts/routing-fixture.py';
type Endpoint={host:string;family:number;httpPort:number;udpPort:number;dnsPort:number};
let server:ChildProcess,ends:Endpoint[];
const cleanups:(()=>void|Promise<void>)[]=[];
beforeAll(async()=>{
  server=spawn('python3',[fixture,'serve','--bind','127.0.0.1','--bind','::1'],{stdio:['ignore','pipe','pipe']});
  ends=await new Promise<Endpoint[]>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Fixture readiness timed out')),3000);let output='',errors='';
    server.stdout!.on('data',data=>{output+=data.toString();if(output.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(output.split('\n')[0]).endpoints);}catch(error){reject(error);}}});
    server.stderr!.on('data',data=>{errors+=data.toString();});
    server.once('error',reject);server.once('exit',()=>{clearTimeout(timer);reject(new Error(`Fixture exited before readiness: ${errors}`));});
  });
});
afterAll(async()=>{if(server?.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}});
afterEach(async()=>{for(const close of cleanups.splice(0))await close();});
async function probe(host:string,protocol:string,port:number){const result=await exec('python3',[fixture,'probe','--host',host,'--protocol',protocol,'--port',String(port),'--timeout','0.2'],{timeout:3000});return JSON.parse(result.stdout);}
it.each([4,6])('measures the actual IPv%i loopback source through all four protocols',async family=>{
  const endpoint=ends.find(e=>e.family===family)!;expect(endpoint).toBeDefined();
  for(const protocol of ['http','udp','dns_udp','dns_tcp']){
    const port=protocol==='http'?endpoint.httpPort:protocol==='udp'?endpoint.udpPort:endpoint.dnsPort;
    expect(await probe(endpoint.host,protocol,port)).toEqual({status:'received',source:family===4?'127.0.0.1':'::1'});
  }
});
it('serves a real DNS TXT response with matching transaction and question',async()=>{
  const endpoint=ends[0],socket=createSocket('udp4');cleanups.push(()=>{socket.close();});
  const question=Buffer.concat([Buffer.from([7]),Buffer.from('rawtest'),Buffer.from([4]),Buffer.from('styg'),Buffer.from([4]),Buffer.from('test'),Buffer.from([0,0,16,0,1])]);
  const query=Buffer.concat([Buffer.from('123401000001000000000000','hex'),question]);
  const received=once(socket,'message');socket.send(query,endpoint.dnsPort,endpoint.host);
  const [response]=await received as [Buffer];
  expect(response.subarray(0,12).toString('hex')).toBe('123481800001000100000000');
  expect(response.subarray(12,12+question.length)).toEqual(question);
  expect(response.subarray(-17).toString()).toBe('rawtest|127.0.0.1');
});
it('reports an actual silent UDP socket as a timeout',async()=>{
  const socket=createSocket('udp4');cleanups.push(()=>{socket.close();});socket.bind(0,'127.0.0.1');await once(socket,'listening');
  expect(await probe('127.0.0.1','udp',socket.address().port)).toEqual({status:'timeout'});
});
it('reports refused TCP as an error, never a successful blocking observation',async()=>{
  const tcp=createServer();tcp.listen(0,'127.0.0.1');await once(tcp,'listening');const port=(tcp.address() as {port:number}).port;await new Promise<void>(resolve=>tcp.close(()=>resolve()));
  expect(await probe('127.0.0.1','dns_tcp',port)).toMatchObject({status:'error'});
});
it('rejects a response with the wrong nonce',async()=>{
  const socket=createSocket('udp4');cleanups.push(()=>{socket.close();});
  socket.on('message',(_data,remote)=>socket.send(JSON.stringify({nonce:'stale',source:'127.0.0.1'}),remote.port,remote.address));
  socket.bind(0,'127.0.0.1');await once(socket,'listening');
  expect(await probe('127.0.0.1','udp',socket.address().port)).toMatchObject({status:'error'});
});
it('rejects a mismatched DNS transaction instead of recording a timeout',async()=>{
  const socket=createSocket('udp4');cleanups.push(()=>{socket.close();});
  socket.on('message',(data,remote)=>{const wrong=Buffer.from(data);wrong.writeUInt16BE((wrong.readUInt16BE()+1)%65536);socket.send(wrong,remote.port,remote.address);});
  socket.bind(0,'127.0.0.1');await once(socket,'listening');
  expect(await probe('127.0.0.1','dns_udp',socket.address().port)).toMatchObject({status:'error'});
});
it('rejects truncated DNS TCP frames',async()=>{
  const tcp=createServer(socket=>{socket.on('data',()=>socket.end(Buffer.from([0,20,1])));});cleanups.push(()=>new Promise<void>(resolve=>tcp.close(()=>resolve())));
  tcp.listen(0,'127.0.0.1');await once(tcp,'listening');
  expect(await probe('127.0.0.1','dns_tcp',(tcp.address() as {port:number}).port)).toMatchObject({status:'error'});
});
it('does not call an established but silent TCP connection blocked traffic',async()=>{
  const sockets=new Set<import('node:net').Socket>();
  const tcp=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  cleanups.push(()=>{for(const socket of sockets)socket.destroy();return new Promise<void>(resolve=>tcp.close(()=>resolve()));});
  tcp.listen(0,'127.0.0.1');await once(tcp,'listening');
  expect(await probe('127.0.0.1','dns_tcp',(tcp.address() as {port:number}).port)).toMatchObject({status:'error'});
});
