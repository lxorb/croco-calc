import { CompletedEvent, Result } from "@croco-calc/schemas/results";
import { Mode } from "@croco-calc/schemas/shared";
import { ObjectId } from "mongodb";
import { WithObjectId } from "./misc";

/**
 * The persisted result document.
 *
 * monkeytype's `replaceLegacyValues` (legacy `correctChars`/`incorrectChars`,
 * `funbox` as a `#`-joined string, `chartData.raw` -> `chartData.burst`, numeric
 * `mode2`, `english_expanded` -> `english_1k`) is deliberately **not** carried:
 * every one of those fields is deleted by AC-007 / ME-164 / C15, and croco calc
 * starts from an empty `results` collection, so there is no legacy shape to
 * migrate from.
 */
export type DBResult = WithObjectId<Result<Mode>>;

/**
 * Build the document to persist from a validated `CompletedEvent`.
 *
 * The client-supplied anti-cheat inputs (`hash`, `mathSeed`, `mathSettings`,
 * `engineVersion`, `taskLog`, `incompleteTests`) are consumed by the validation
 * pipeline and are **not** stored: they are several kB per result, they carry no
 * user-facing information, and keeping the task log would put every task's exact
 * answer in a document the owning user can read back (C29's spirit).
 */
export function buildDbResult(
  completedEvent: CompletedEvent,
  userName: string,
  isPb: boolean,
): DBResult {
  const ce = completedEvent;
  const res: DBResult = {
    _id: new ObjectId(),
    uid: ce.uid,
    name: userName,
    score: ce.score,
    correct: ce.correct,
    wrong: ce.wrong,
    acc: ce.acc,
    tpm: ce.tpm,
    spm: ce.spm,
    consistency: ce.consistency,
    mode: ce.mode,
    mode2: ce.mode2,
    timestamp: ce.timestamp,
    testDuration: ce.testDuration,
    afkDuration: ce.afkDuration,
    restartCount: ce.restartCount,
    incompleteTestSeconds: ce.incompleteTestSeconds,
    chartData: ce.chartData,
    settings: ce.settings,
    settingsId: ce.settingsId,
    isPb,
  };

  //compress the object by omitting default values. The frontend adds them back
  //after reading; this is monkeytype's own trick and it materially reduces both
  //the database size and the REST payload.
  if (res.restartCount === 0) delete res.restartCount;
  if (res.incompleteTestSeconds === 0) delete res.incompleteTestSeconds;
  if (res.afkDuration === 0) delete res.afkDuration;
  if (res.isPb === false) delete res.isPb;

  return res;
}
