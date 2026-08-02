import { Collection, type DeleteResult, Filter, ObjectId } from "mongodb";
import CrocoError from "../utils/error";
import * as db from "../init/db";
import { getUser } from "./user";
import { DBResult } from "../utils/result";
import { tryCatch } from "@croco-calc/util/trycatch";

export const getResultCollection = (): Collection<DBResult> =>
  db.collection<DBResult>("results");

export async function addResult(
  uid: string,
  result: DBResult,
): Promise<{ insertedId: ObjectId }> {
  const { data: user } = await tryCatch(getUser(uid, "add result"));

  if (!user) throw new CrocoError(404, "User not found", "add result");
  result.uid ??= uid;
  // result.ir = true;
  const res = await getResultCollection().insertOne(result);
  return {
    insertedId: res.insertedId,
  };
}

export async function deleteAll(uid: string): Promise<DeleteResult> {
  return await getResultCollection().deleteMany({ uid });
}

export async function getResult(uid: string, id: string): Promise<DBResult> {
  const result = await getResultCollection().findOne({
    _id: new ObjectId(id),
    uid,
  });

  if (!result) throw new CrocoError(404, "Result not found");
  return result;
}

export async function getLastResult(uid: string): Promise<DBResult> {
  const lastResult = await getResultCollection().findOne(
    { uid },
    { sort: { timestamp: -1 } },
  );

  if (lastResult === null) throw new CrocoError(404, "No last result found");
  return lastResult;
}

export async function getLastResultTimestamp(uid: string): Promise<number> {
  const lastResult = await getResultCollection().findOne(
    { uid },
    {
      projection: { timestamp: 1, _id: 0 },
      sort: { timestamp: -1 },
    },
  );

  if (lastResult === null) throw new CrocoError(404, "No last result found");
  return lastResult.timestamp;
}

export async function getResultByTimestamp(
  uid: string,
  timestamp: number,
): Promise<DBResult | null> {
  const result = await getResultCollection().findOne({ uid, timestamp });
  if (result === null) return null;
  return result;
}

type GetResultsOpts = {
  onOrAfterTimestamp?: number;
  limit?: number;
  offset?: number;
};

export async function getResults(
  uid: string,
  opts?: GetResultsOpts,
): Promise<DBResult[]> {
  const { onOrAfterTimestamp, offset, limit } = opts ?? {};

  const condition: Filter<DBResult> = { uid };
  if (
    onOrAfterTimestamp !== undefined &&
    onOrAfterTimestamp !== null &&
    !isNaN(onOrAfterTimestamp)
  ) {
    condition.timestamp = { $gte: onOrAfterTimestamp };
  }

  let query = getResultCollection()
    .find(condition, {
      // `ResultMinifiedSchema` — the account page's results table never renders
      // the chart series or the owner's own name.
      projection: {
        chartData: 0,
        name: 0,
      },
    })
    .sort({ timestamp: -1 });

  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (offset !== undefined) {
    query = query.skip(offset);
  }

  const results = await query.toArray();
  if (results === undefined) throw new CrocoError(404, "Result not found");
  return results;
}
