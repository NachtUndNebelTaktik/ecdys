import {expect,it} from 'vitest';
import {openCredential,sealCredential} from '../packages/desktop/src/vpn/credentials';
it('authenticates credentials against provider and master key without storing the account in the envelope',()=>{
  const key=Buffer.alloc(32,17),account='1234567890123456';
  const envelope=sealCredential(account,key,'mullvad');
  expect(envelope.includes(Buffer.from(account))).toBe(false);
  expect(openCredential(envelope,key,'mullvad')).toBe(account);
  expect(()=>openCredential(envelope,key,'ivpn')).toThrow();
  expect(()=>openCredential(envelope,Buffer.alloc(32,18),'mullvad')).toThrow();
  const corrupt=Buffer.from(envelope);corrupt[corrupt.length-1]^=1;
  expect(()=>openCredential(corrupt,key,'mullvad')).toThrow();
  expect(sealCredential(account,key,'mullvad')).not.toEqual(envelope);
});
