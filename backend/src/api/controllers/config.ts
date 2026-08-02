import { PartialConfig } from "@croco-calc/schemas/configs";
import * as ConfigDAL from "../../dal/config";
import { CrocoResponse } from "../../utils/croco-response";
import { GetConfigResponse } from "@croco-calc/contracts/configs";
import { CrocoRequest } from "../types";

export async function getConfig(
  req: CrocoRequest,
): Promise<GetConfigResponse> {
  const { uid } = req.ctx.decodedToken;
  const data = (await ConfigDAL.getConfig(uid))?.config ?? null;

  return new CrocoResponse("Configuration retrieved", data);
}

export async function saveConfig(
  req: CrocoRequest<undefined, PartialConfig>,
): Promise<CrocoResponse> {
  const config = req.body;
  const { uid } = req.ctx.decodedToken;

  await ConfigDAL.saveConfig(uid, config);

  return new CrocoResponse("Config updated", null);
}

export async function deleteConfig(
  req: CrocoRequest,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;

  await ConfigDAL.deleteConfig(uid);
  return new CrocoResponse("Config deleted", null);
}
