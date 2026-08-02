import {
  GetScoreHistogramQuery,
  GetScoreHistogramResponse,
  GetSiteStatsResponse,
} from "@croco-calc/contracts/public";
import * as PublicDAL from "../../dal/public";
import { CrocoResponse } from "../../utils/croco-response";
import { CrocoRequest } from "../types";

export async function getScoreHistogram(
  req: CrocoRequest<GetScoreHistogramQuery>,
): Promise<GetScoreHistogramResponse> {
  const { mode, mode2 } = req.query;
  const data = await PublicDAL.getScoreHistogram(mode, mode2);
  return new CrocoResponse("Public score histogram retrieved", data);
}

export async function getSiteStats(
  _req: CrocoRequest,
): Promise<GetSiteStatsResponse> {
  const data = await PublicDAL.getSiteStats();
  return new CrocoResponse("Public site stats retrieved", data);
}
