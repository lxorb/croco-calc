import * as Configuration from "../../init/configuration";
import { CrocoResponse } from "../../utils/croco-response";
import { CONFIGURATION_FORM_SCHEMA } from "../../constants/base-configuration";
import {
  ConfigurationSchemaResponse,
  GetConfigurationResponse,
  PatchConfigurationRequest,
} from "@croco-calc/contracts/configuration";
import CrocoError from "../../utils/error";
import { CrocoRequest } from "../types";

export async function getConfiguration(
  _req: CrocoRequest,
): Promise<GetConfigurationResponse> {
  const currentConfiguration = await Configuration.getCachedConfiguration(true);
  return new CrocoResponse("Configuration retrieved", currentConfiguration);
}

export async function getSchema(
  _req: CrocoRequest,
): Promise<ConfigurationSchemaResponse> {
  return new CrocoResponse(
    "Configuration schema retrieved",
    CONFIGURATION_FORM_SCHEMA,
  );
}

export async function updateConfiguration(
  req: CrocoRequest<undefined, PatchConfigurationRequest>,
): Promise<CrocoResponse> {
  const { configuration } = req.body;
  const success = await Configuration.patchConfiguration(configuration);

  if (!success) {
    throw new CrocoError(500, "Configuration update failed");
  }

  return new CrocoResponse("Configuration updated", null);
}
