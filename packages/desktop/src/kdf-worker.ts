import {parentPort, workerData} from 'node:worker_threads';
import argon2 from 'argon2';

async function run() {
  const key = await argon2.hash(workerData.passphrase, {
    type: argon2.argon2id,
    salt: Buffer.from(workerData.salt),
    memoryCost: workerData.memoryMiB * 1024,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
    raw: true,
  });
  parentPort?.postMessage({key});
  key.fill(0);
}
run().catch(() => parentPort?.postMessage({error: true}));
