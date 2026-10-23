import type {Readable,Writable} from 'node:stream';
const MAX_FRAME=8*1024*1024;
type Pending={resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};
export class CdpPipe {
  private sequence=0;
  private pending=new Map<number,Pending>();
  private buffer=Buffer.alloc(0);
  private failure:Error|undefined;
  private finishClosed!:(error:Error)=>void;
  readonly closed=new Promise<Error>(resolve=>{this.finishClosed=resolve;});
  constructor(private input:Writable,output:Readable,private timeoutMs=10000) {
    input.on('error',error=>this.dispose(error));output.on('error',error=>this.dispose(error));
    output.on('end',()=>this.dispose());output.on('close',()=>this.dispose());
    output.on('data',(chunk:Buffer)=>this.receive(Buffer.from(chunk)));
  }
  send<T=unknown>(method:string,params:Record<string,unknown>={},sessionId?:string):Promise<T> {
    if(this.failure)return Promise.reject(this.failure);
    if(this.pending.size>=128)return Promise.reject(new Error('Too many pending DevTools commands'));
    const id=++this.sequence,frame=JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0';
    if(Buffer.byteLength(frame)>MAX_FRAME)return Promise.reject(new Error('DevTools frame exceeds the size limit'));
    return new Promise<T>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`DevTools command timed out: ${method}`));},this.timeoutMs);
      this.pending.set(id,{resolve:resolve as (value:unknown)=>void,reject,timer});
      this.input.write(frame,error=>{if(error)this.dispose(error);});
    });
  }
  private receive(chunk:Buffer) {
    if(this.failure)return;
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(true) {
      const end=this.buffer.indexOf(0);if(end===-1)break;
      if(end>MAX_FRAME){this.dispose(new Error('DevTools frame exceeds the size limit'));return;}
      const frame=this.buffer.subarray(0,end);this.buffer=this.buffer.subarray(end+1);
      try {
        const value=JSON.parse(frame.toString('utf8'));
        if(!value||typeof value!=='object')throw new Error('Invalid DevTools JSON frame');
        if(typeof value.id!=='number'){if(typeof value.method==='string')continue;throw new Error('Invalid DevTools response frame');}
        const pending=this.pending.get(value.id);if(!pending)continue;
        if(!('result' in value)&&!value.error)throw new Error('Invalid DevTools response frame');
        clearTimeout(pending.timer);this.pending.delete(value.id);
        if(value.error)pending.reject(new Error(`DevTools error: ${String(value.error.message??'Command failed').slice(0,300)}`));
        else pending.resolve(value.result);
      }catch(error){this.dispose(error instanceof Error?error:new Error('Invalid DevTools JSON frame'));return;}
    }
    if(this.buffer.length>MAX_FRAME)this.dispose(new Error('DevTools frame exceeds the size limit'));
  }
  dispose(error=new Error('DevTools pipe closed')) {
    if(this.failure)return;this.failure=error;this.buffer=Buffer.alloc(0);
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();this.finishClosed(error);
  }
}
