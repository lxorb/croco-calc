import {
  GetScoreHistogramQuery,
  GetScoreHistogramResponse,
  GetTrainingStatsResponse,
} from "@croco-calc/contracts/public";
import * as PublicDAL from "../../dal/public";
import { CrocoResponse } from "../../utils/croco-response";
import { CrocoRequest } from "../types";

export async function getScoreHistogram(
  req: CrocoRequest<GetScoreHistogramQuery>,
): Promise<GetScoreHistogramResponse> {
  // CP-137: `{ time: 4 | 8 }`. The router runs with `jsonQuery: true`, so the
  // literal arrives already decoded as a number and the contract has rejected
  // anything that is not 4 or 8 before we get here.
  const { time } = req.query;
  const data = await PublicDAL.getScoreHistogram(time);
  return new CrocoResponse("Public score histogram retrieved", data);
}

export async function getTrainingStats(
  _req: CrocoRequest,
): Promise<GetTrainingStatsResponse> {
  const data = await PublicDAL.getTrainingStats();
  return new CrocoResponse("Public training stats retrieved", data);
}
