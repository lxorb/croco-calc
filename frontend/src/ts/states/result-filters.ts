import { ResultFilters, ResultFiltersSchema } from "@croco-calc/schemas/users";
import { mergeWithDefaultFilters } from "../components/pages/account/utils";
import defaultResultFilters from "../constants/default-result-filters";
import { useLocalStorageStore } from "../hooks/useLocalStorageStore";
import { isObject } from "../utils/misc";
import { sanitize } from "../utils/sanitize";

/**
 * AC-081: the filter selection is persisted per user and restored on load.
 * monkeytype's `updateTagsInFilterStorage` is gone with tags (master C15).
 */
export const [filters, setFilters] = useLocalStorageStore({
  key: "resultFilters",
  schema: ResultFiltersSchema,
  fallback: defaultResultFilters,
  migrate: migrateFilterStorage,
});

function migrateFilterStorage(input: unknown): ResultFilters {
  if (!isObject(input)) {
    return defaultResultFilters;
  }
  const filters = sanitize(
    ResultFiltersSchema.partial().strip(),
    input as ResultFilters,
  );
  return mergeWithDefaultFilters(filters);
}
