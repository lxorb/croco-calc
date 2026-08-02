import { GetPsaResponse } from "@croco-calc/contracts/psas";
import * as PsaDAL from "../../dal/psa";
import { CrocoResponse } from "../../utils/croco-response";
import { replaceObjectIds } from "../../utils/misc";
import { CrocoRequest } from "../types";
import { PSA } from "@croco-calc/schemas/psas";
import { cacheWithTTL } from "../../utils/ttl-cache";

//cache for one minute
const cache = cacheWithTTL<PSA[]>(1 * 60 * 1000, async () => {
  return replaceObjectIds(await PsaDAL.get());
});

export async function getPsas(_req: CrocoRequest): Promise<GetPsaResponse> {
  return new CrocoResponse("PSAs retrieved", (await cache()) ?? []);
}
