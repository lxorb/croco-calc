import {
  CreateConnectionRequest,
  CreateConnectionResponse,
  GetConnectionsQuery,
  GetConnectionsResponse,
  IdPathParams,
  UpdateConnectionRequest,
} from "@croco-calc/contracts/connections";
import { CrocoRequest } from "../types";
import { CrocoResponse } from "../../utils/croco-response";
import * as ConnectionsDal from "../../dal/connections";
import * as UserDal from "../../dal/user";
import { replaceObjectId, omit } from "../../utils/misc";
import CrocoError from "../../utils/error";

import { Connection } from "@croco-calc/schemas/connections";

function convert(db: ConnectionsDal.DBConnection): Connection {
  return replaceObjectId(omit(db, ["key"]));
}
export async function getConnections(
  req: CrocoRequest<GetConnectionsQuery>,
): Promise<GetConnectionsResponse> {
  const { uid } = req.ctx.decodedToken;
  const { status, type } = req.query;

  const results = await ConnectionsDal.getConnections({
    initiatorUid:
      type === undefined || type.includes("outgoing") ? uid : undefined,
    receiverUid:
      type === undefined || type?.includes("incoming") ? uid : undefined,
    status: status,
  });

  return new CrocoResponse("Connections retrieved", results.map(convert));
}

export async function createConnection(
  req: CrocoRequest<undefined, CreateConnectionRequest>,
): Promise<CreateConnectionResponse> {
  const { uid } = req.ctx.decodedToken;
  const { receiverName } = req.body;
  const { maxPerUser } = req.ctx.configuration.connections;

  const receiver = await UserDal.getUserByName(
    receiverName,
    "create connection",
  );

  if (uid === receiver.uid) {
    throw new CrocoError(400, "You cannot be your own friend, sorry.");
  }

  const initiator = await UserDal.getPartialUser(uid, "create connection", [
    "uid",
    "name",
  ]);

  const result = await ConnectionsDal.create(initiator, receiver, maxPerUser);

  return new CrocoResponse("Connection created", convert(result));
}

export async function deleteConnection(
  req: CrocoRequest<undefined, undefined, IdPathParams>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { id } = req.params;

  await ConnectionsDal.deleteById(uid, id);

  return new CrocoResponse("Connection deleted", null);
}

export async function updateConnection(
  req: CrocoRequest<undefined, UpdateConnectionRequest, IdPathParams>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { id } = req.params;
  const { status } = req.body;

  await ConnectionsDal.updateStatus(uid, id, status);

  return new CrocoResponse("Connection updated", null);
}
