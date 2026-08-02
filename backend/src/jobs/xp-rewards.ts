/**
 * Placement-reward plumbing shared by the two INF-066 rollover jobs.
 *
 * Both jobs award XP by dropping a mail into the winner's inbox, and both have
 * to survive being run twice over the same period (INF-153). `addToInboxBulk`
 * is an unconditional `$push`, so replaying it would hand out the reward again;
 * the deterministic mail id below is what makes the second run a no-op.
 */

import { CrocoMail } from "@croco-calc/schemas/users";
import { RewardBracket } from "@croco-calc/schemas/configuration";
import { isSafeNumber, mapRange } from "@croco-calc/util/numbers";
import { getUsersCollection } from "../dal/user";

/**
 * The reward for `rank`, interpolated across every bracket that contains it, or
 * `undefined` when no bracket does. Transcribed from monkeytype's
 * `later-worker.ts` — only its home moved (INF-066), not its arithmetic.
 */
export function calculateXpReward(
  xpRewardBrackets: RewardBracket[],
  rank: number,
): number | undefined {
  const rewards = xpRewardBrackets
    .filter((bracket) => rank >= bracket.minRank && rank <= bracket.maxRank)
    .map((bracket) =>
      mapRange(
        rank,
        bracket.minRank,
        bracket.maxRank,
        bracket.maxReward,
        bracket.minReward,
      ),
    );
  return rewards.length > 0 ? Math.max(...rewards) : undefined;
}

/** The highest rank any bracket can still pay out for. */
export function maxRewardedRank(xpRewardBrackets: RewardBracket[]): number {
  return Math.max(0, ...xpRewardBrackets.map((bracket) => bracket.maxRank));
}

/**
 * `IdSchema` is `/^[a-zA-Z0-9_]+$/`, so every separator has to collapse to an
 * underscore. The parts are `(board, periodKey, uid)`, which is exactly the
 * identity of one placement reward.
 */
export function rewardMailId(
  board: string,
  periodKey: string,
  uid: string,
): string {
  return `${board}_${periodKey}_${uid}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * INF-153 — drops the entries whose reward mail is already in the recipient's
 * inbox, so a second run over the same `periodKey` writes nothing.
 */
export async function withoutAlreadyRewarded(
  entries: { uid: string; mail: CrocoMail[] }[],
): Promise<{ uid: string; mail: CrocoMail[] }[]> {
  if (entries.length === 0) return [];

  const mailIds = entries.flatMap((entry) => entry.mail.map((mail) => mail.id));

  const existing = await getUsersCollection()
    .find(
      {
        uid: { $in: entries.map((entry) => entry.uid) },
        "inbox.id": { $in: mailIds },
      },
      { projection: { uid: 1, "inbox.id": 1 } },
    )
    .toArray();

  const seen = new Set<string>();
  for (const user of existing) {
    for (const mail of user.inbox ?? []) seen.add(`${user.uid}:${mail.id}`);
  }

  return entries
    .map((entry) => ({
      uid: entry.uid,
      mail: entry.mail.filter((mail) => !seen.has(`${entry.uid}:${mail.id}`)),
    }))
    .filter((entry) => entry.mail.length > 0);
}

/**
 * `buildCrocoMail` mints a random id on purpose — every other caller wants one.
 * These two do not, so the id is replaced after the fact rather than by widening
 * that helper's options for a single pair of callers.
 */
export function withDeterministicId(
  mail: CrocoMail,
  id: string,
): CrocoMail & { id: string } {
  return { ...mail, id };
}

export function isRewardable(xpReward: number | undefined): xpReward is number {
  return isSafeNumber(xpReward) && xpReward > 0;
}
