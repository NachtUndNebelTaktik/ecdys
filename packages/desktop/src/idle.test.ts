import {describe, expect, it} from 'vitest';
import {shouldLockVault} from './idle';

describe('vault idle policy', () => {
  it('locks an unlocked vault after fifteen minutes of system inactivity', () => {
    expect(shouldLockVault(true, 899)).toBe(false);
    expect(shouldLockVault(true, 900)).toBe(true);
    expect(shouldLockVault(true, 1800)).toBe(true);
    expect(shouldLockVault(false, 1800)).toBe(false);
  });
});
