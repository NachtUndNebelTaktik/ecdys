import type {ChildProcess} from 'node:child_process';
import type {Readable, Writable} from 'node:stream';

export class BrowserCdp {
  private next = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<
    number,
    {resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout}
  >();
  onEvent: (method: string, params: any) => void = () => undefined;
  private input: Writable;
  constructor(child: ChildProcess) {
    this.input = child.stdio[3] as Writable;
    const output = child.stdio[4] as Readable;
    output.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > 8_388_608) {
        this.close();
        return;
      }
      let end: number;
      while ((end = this.buffer.indexOf(0)) >= 0) {
        const raw = this.buffer.subarray(0, end);
        this.buffer = this.buffer.subarray(end + 1);
        try {
          const value = JSON.parse(raw.toString());
          if (typeof value.id === 'number') {
            const request = this.pending.get(value.id);
            if (request) {
              clearTimeout(request.timer);
              this.pending.delete(value.id);
              if (value.error) request.reject(new Error('The browser rejected this operation.'));
              else request.resolve(value.result);
            }
          } else if (typeof value.method === 'string') this.onEvent(value.method, value.params);
        } catch {
          this.close();
        }
      }
    });
    output.on('error', () => this.close());
    this.input.on('error', () => this.close());
    child.once('exit', () => this.close());
  }
  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    if (this.pending.size >= 64 || this.input.destroyed)
      return Promise.reject(new Error('The browser is unavailable.'));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The browser operation timed out.'));
      }, 10_000);
      this.pending.set(id, {resolve, reject, timer});
      this.input.write(
        JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + '\0',
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(new Error('The browser connection closed.'));
          }
        },
      );
    });
  }
  close() {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('The browser connection closed.'));
    }
    this.pending.clear();
  }
}
