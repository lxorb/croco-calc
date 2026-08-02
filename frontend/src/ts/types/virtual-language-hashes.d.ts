import { Language } from "@croco-calc/schemas/languages";

declare module "virtual:language-hashes" {
  export const languageHashes: Record<Language, string>;
}
