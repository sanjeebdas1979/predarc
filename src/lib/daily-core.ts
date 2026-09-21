export const DAILY_PERIOD_SECONDS = 86_400;
export type DailyStatus = {
  activeUntil: number;
  nextClaimAt: number;
  unclaimedPoints: bigint;
  claimedPoints: bigint;
};

// UI projection only. Contract timestamp/state is authoritative.
export function dailyAvailability(status: DailyStatus, nowSeconds: number) {
  const activateIn = Math.max(0, status.activeUntil - nowSeconds);
  const claimIn = Math.max(0, status.nextClaimAt - nowSeconds);
  return {
    active: activateIn > 0,
    canActivate: activateIn === 0,
    canClaim: claimIn === 0 && status.unclaimedPoints > BigInt(0),
    activateIn,
    claimIn,
  };
}

export function countdown(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return [Math.floor(value / 3600), Math.floor(value % 3600 / 60), value % 60]
    .map(part => String(part).padStart(2, "0")).join(":");
}
