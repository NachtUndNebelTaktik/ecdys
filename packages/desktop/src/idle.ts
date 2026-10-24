export function shouldLockVault(unlocked: boolean, systemIdleSeconds: number): boolean {
  return unlocked && systemIdleSeconds >= 15 * 60;
}
