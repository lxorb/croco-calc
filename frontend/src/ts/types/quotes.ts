import { Language } from "@croco-calc/schemas/languages";
import { QuoteDataQuote } from "@croco-calc/schemas/quotes";
import { RequiredProperties } from "../utils/misc";

export type Quote = QuoteDataQuote & {
  group: number;
  language: Language;
  textSplit?: string[];
};

export type QuoteWithTextSplit = RequiredProperties<Quote, "textSplit">;
