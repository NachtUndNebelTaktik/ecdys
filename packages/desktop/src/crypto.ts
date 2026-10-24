import {createCipheriv, createDecipheriv, hkdfSync, randomBytes} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {availableMemory} from 'node:process';

export interface Sealed {
  iv: string;
  tag: string;
  ciphertext: string;
}
export function subkey(master: Buffer, domain: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), domain, 32));
}
export function seal(plaintext: Buffer, key: Buffer, context: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}
export function unseal(value: Sealed, key: Buffer, context: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]);
}
export function deriveKeyInWorker(
  passphrase: string,
  salt: Buffer,
  memoryMiB: number,
): Promise<Buffer> {
  if (availableMemory() < memoryMiB * 1024 * 1024 + 512 * 1024 * 1024) {
    return Promise.reject(
      new Error(
        'Insufficient memory for the selected KDF. Choose a lower supported setting explicitly.',
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'kdf-worker.cjs'), {
      workerData: {passphrase, salt, memoryMiB},
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Key derivation timed out.'));
    }, 120_000);
    worker.once('message', (message: {key?: Uint8Array; error?: boolean}) => {
      clearTimeout(timer);
      if (message.key) resolve(Buffer.from(message.key));
      else reject(new Error('Key derivation failed.'));
    });
    worker.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Key derivation failed.'));
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('Key derivation failed.'));
    });
  });
}
