/**
 * Seeded PRNG (ME-166 … ME-172).
 *
 * monkeytype's word generator is explicitly unseeded — it aliases the platform's
 * built-in unseeded generator at module scope in
 * `frontend/src/ts/test/words-generator.ts`. croco calc cannot do that: the
 * backend has to regenerate the exact task sequence from `(mathSeed, mathSettings)`
 * to revalidate a submitted result (ME-171, ME-174).
 *
 * The algorithm is **mulberry32**, pinned constant-for-constant by ME-167 so that
 * the frontend and the backend produce byte-identical streams. Do not substitute
 * another PRNG — the constants are part of the wire contract.
 *
 * ME-166 bans the platform's unseeded generator from this package as a **token**,
 * not merely as a call: DoD-10 greps for it, so the identifier pair is not spelled
 * out anywhere here, comments included. `.oxlintrc.json` enforces the call site;
 * `__tests__/purity.spec.ts` enforces the token.
 */

const MULBERRY32_INCREMENT = 0x6d2b79f5;
const GOLDEN_RATIO_32 = 0x9e3779b1;
const UINT32_RANGE = 4294967296;

/** The mixing half of one mulberry32 step. Returns a uint32. */
function mix(state: number): number {
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * One complete mulberry32 step applied to `state`, returning the **raw uint32**
 * output rather than the `[0, 1)` float. Used to derive per-task seeds (ME-170).
 */
export function mulberry32Raw(state: number): number {
  return mix((state + MULBERRY32_INCREMENT) | 0);
}

/** A seeded pseudo-random source. The only source of randomness in the engine. */
export type Prng = {
  /** Next value in `[0, 1)` (ME-167). */
  next(): number;
  /** Uniform integer in `[min, max]`, both inclusive (ME-168). */
  nextInt(min: number, max: number): number;
  /** Number of values drawn so far. Diagnostic only. */
  readonly draws: number;
};

/**
 * Creates a mulberry32 stream from a uint32 seed.
 *
 * `nextInt` reproduces the semantics of monkeytype's `randomIntFromRange`
 * (`packages/util/src/numbers.ts`) — inclusive on both ends — but sourced from
 * this seeded stream instead of the platform's unseeded generator (ME-168).
 */
export function createPrng(seed: number): Prng {
  let state = seed | 0;
  let drawCount = 0;

  return {
    next(): number {
      state = (state + MULBERRY32_INCREMENT) | 0;
      drawCount++;
      return mix(state) / UINT32_RANGE;
    },
    nextInt(min: number, max: number): number {
      if (max < min) {
        throw new RangeError(`nextInt: empty range [${min}, ${max}]`);
      }
      return min + Math.floor(this.next() * (max - min + 1));
    },
    get draws(): number {
      return drawCount;
    },
  };
}

/**
 * Per-task seed derivation (ME-170):
 * `taskSeed = mulberry32Step(testSeed ^ imul(index + 1, 0x9E3779B1))`.
 *
 * This is what makes `generateTask` independent of how many tasks came before
 * it, of user timing and of regeneration retries.
 */
export function deriveTaskSeed(testSeed: number, index: number): number {
  return mulberry32Raw((testSeed ^ Math.imul(index + 1, GOLDEN_RATIO_32)) | 0);
}

/**
 * Creates the PRNG for task `index` of the test seeded with `testSeed`.
 * Retry loops (ME-030, ME-101, ME-125) keep drawing from this same instance and
 * MUST NOT reseed (ME-172), which makes the retry count itself deterministic.
 */
export function createTaskPrng(testSeed: number, index: number): Prng {
  return createPrng(deriveTaskSeed(testSeed, index));
}
