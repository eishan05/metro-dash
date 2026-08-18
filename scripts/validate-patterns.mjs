/**
 * Proves every shipped obstacle layout is survivable, and that the reachability
 * search still rejects layouts that aren't.
 *
 * Run with `npm run validate`. Also runs in CI before the build, so a pattern
 * edit that creates an unwinnable wall fails the deploy instead of reaching
 * players.
 */
import { PATTERNS, isSolvable, JUMP_APEX, JUMP_SPAN, ROLL_SPAN } from '../src/game/Patterns.js';

let failures = 0;
const fail = (msg) => { console.error(`FAIL  ${msg}`); failures++; };
const pass = (msg) => console.log(`pass  ${msg}`);

console.log(`player: jump apex ${JUMP_APEX.toFixed(2)}u, jump span ${JUMP_SPAN.toFixed(2)}u, roll span ${ROLL_SPAN}u\n`);

// 1. Every shipped pattern survived load-time validation.
if (PATTERNS.length === 0) fail('no patterns loaded');
else pass(`${PATTERNS.length} patterns loaded and validated`);

// 2. Difficulty must start at zero, or a new run has nothing to spawn.
if (!PATTERNS.some((p) => p.difficulty <= 0.001)) fail('no pattern is available at difficulty 0');
else pass('at least one pattern is available from the very start');

// 3. Layouts with no survivable line must be rejected.
const unwinnable = [
  ['walls across every lane', { length: 4, items: [
    { lane: 0, type: 'barrierFull', f: 1 }, { lane: 1, type: 'barrierFull', f: 1 },
    { lane: 2, type: 'barrierFull', f: 1 }] }],
  ['tall trains across every lane', { length: 30, items: [
    { lane: 0, type: 'trainHigh', f: 14 }, { lane: 1, type: 'trainHigh', f: 14 },
    { lane: 2, type: 'trainHigh', f: 14 }] }],
  ['wall lands mid-roll with no way out', { length: 8, items: [
    { lane: 0, type: 'barrierFull', f: 1 }, { lane: 1, type: 'barrierTop', f: 1 },
    { lane: 2, type: 'barrierFull', f: 1 }, { lane: 0, type: 'barrierFull', f: 4 },
    { lane: 1, type: 'barrierFull', f: 4 }, { lane: 2, type: 'barrierFull', f: 4 }] }],
  ['wall outlasts the jump arc', { length: 10, items: [
    { lane: 0, type: 'barrierLow', f: 1 }, { lane: 1, type: 'barrierLow', f: 1 },
    { lane: 2, type: 'barrierLow', f: 1 }, { lane: 0, type: 'barrierFull', f: 5 },
    { lane: 1, type: 'barrierFull', f: 5 }, { lane: 2, type: 'barrierFull', f: 5 }] }],
];
for (const [name, pattern] of unwinnable) {
  if (isSolvable(pattern)) fail(`unwinnable layout accepted: ${name}`);
  else pass(`rejects unwinnable layout: ${name}`);
}

// 4. Layouts that need a specific technique must be accepted.
const winnable = [
  ['one clear lane', { length: 4, items: [
    { lane: 0, type: 'barrierFull', f: 1 }, { lane: 1, type: 'barrierFull', f: 1 }] }],
  ['jump is the only way through', { length: 4, items: [
    { lane: 0, type: 'barrierLow', f: 1 }, { lane: 1, type: 'barrierLow', f: 1 },
    { lane: 2, type: 'barrierLow', f: 1 }] }],
  ['roll is the only way through', { length: 4, items: [
    { lane: 0, type: 'barrierTop', f: 1 }, { lane: 1, type: 'barrierTop', f: 1 },
    { lane: 2, type: 'barrierTop', f: 1 }] }],
  ['requires a mid-air lane change', { length: 8, items: [
    { lane: 0, type: 'barrierFull', f: 1 }, { lane: 1, type: 'barrierTop', f: 1 },
    { lane: 2, type: 'barrierFull', f: 1 }, { lane: 1, type: 'barrierFull', f: 3 }] }],
  ['requires landing on a train roof', { length: 22, items: [
    { lane: 0, type: 'barrierFull', f: 1 }, { lane: 1, type: 'trainLow', f: 10 },
    { lane: 2, type: 'barrierFull', f: 1 }] }],
];
for (const [name, pattern] of winnable) {
  if (!isSolvable(pattern)) fail(`winnable layout rejected: ${name}`);
  else pass(`accepts: ${name}`);
}

console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
