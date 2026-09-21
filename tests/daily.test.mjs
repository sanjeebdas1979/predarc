import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyAvailability, countdown} from '../src/lib/daily-core.ts';
const state = (changes = {}) => ({activeUntil: 0, nextClaimAt: 0, unclaimedPoints: 0n, claimedPoints: 0n, ...changes});
test('new wallet: activation available; no empty claim', () => {
  assert.deepEqual(dailyAvailability(state(), 100), {active: false, canActivate: true, canClaim: false, activateIn: 0, claimIn: 0});
});
test('activation changes exactly at expiry', () => {
  const s = state({activeUntil: 86400});
  assert.equal(dailyAvailability(s, 86399).active, true);
  assert.equal(dailyAvailability(s, 86400).canActivate, true);
});
test('claim blocked until exact independent boundary', () => {
  const s = state({activeUntil: 90000, nextClaimAt: 88000, unclaimedPoints: 500n});
  assert.equal(dailyAvailability(s, 87999).canClaim, false);
  assert.equal(dailyAvailability(s, 88000).canClaim, true);
  assert.equal(dailyAvailability(s, 88000).active, true);
});
test('expired activation does not prevent earned points claim', () => {
  assert.equal(dailyAvailability(state({activeUntil: 1, unclaimedPoints: 10n}), 100000).canClaim, true);
});
test('zero points disables claim after cooldown', () => {
  assert.equal(dailyAvailability(state({nextClaimAt: 200}), 201).canClaim, false);
});
test('large point counts preserve bigint precision', () => {
  assert.equal(dailyAvailability(state({unclaimedPoints: 10n ** 30n}), 1).canClaim, true);
});
test('countdown displays rolling 24 hours and clamps expired values', () => {
  assert.equal(countdown(86400), '24:00:00');
  assert.equal(countdown(3661), '01:01:01');
  assert.equal(countdown(-1), '00:00:00');
});
