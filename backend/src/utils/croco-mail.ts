import { CrocoMail } from "@croco-calc/schemas/users";
import { v4 } from "uuid";

type CrocoMailOptions = Partial<Omit<CrocoMail, "id" | "read">>;

export function buildCrocoMail(options: CrocoMailOptions): CrocoMail {
  return {
    id: v4(),
    subject: options.subject ?? "",
    body: options.body ?? "",
    timestamp: options.timestamp ?? Date.now(),
    read: false,
    rewards: options.rewards ?? [],
  };
}
