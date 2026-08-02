import { ResultFilters } from "@croco-calc/schemas/users";
import {
  AdditionSchema,
  DivisionSchema,
  FractionAdditionSchema,
  MultiplicationSchema,
} from "@croco-calc/schemas/math";
import { Mode2Schema } from "@croco-calc/schemas/shared";

/**
 * AC-078 / AC-081: every filter group starts fully selected, except `date`,
 * which is a single-select defaulting to `all time` (AC-076).
 *
 * Keys are the C2 canonical **stored** literals, never the display labels — a
 * filter keyed on `100x100` could never match a result storing `"100"`
 * (master §2.31, gap 4). The upstream prose-mode filter groups,
 * `punctuation`, `numbers`, `tags`, `language` and `funbox` are gone (AC-079).
 */
function allTrue<T extends string>(values: readonly T[]): Record<T, boolean> {
  return Object.fromEntries(values.map((it) => [it, true])) as Record<
    T,
    boolean
  >;
}

const object: ResultFilters = {
  _id: "default",
  name: "defaults",
  pb: { true: true, false: true },
  time: allTrue(Mode2Schema.options),
  addition: allTrue(AdditionSchema.options),
  multiplication: allTrue(MultiplicationSchema.options),
  division: allTrue(DivisionSchema.options),
  fractionAddition: allTrue(FractionAdditionSchema.options),
  fractionMultiplication: { true: true, false: true },
  decimals: { true: true, false: true },
  negatives: { true: true, false: true },
  date: {
    last_day: false,
    last_week: false,
    last_month: false,
    last_3months: false,
    all: true,
  },
};

export default structuredClone(object);
