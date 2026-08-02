/**
 * Whether pressing the quick-restart key may restart immediately, without the
 * "are you sure" confirmation step.
 *
 * Upstream this was a real decision: the guard refused a silent restart when a
 * run was long enough that losing it by accident would hurt — 1000+ items, 900+
 * seconds, or a long custom text. croco calc has exactly one mode and its
 * longest test is 8 minutes (480 s, C2 / ME-119), comfortably under that
 * threshold, and the custom-text and item-count modes it also guarded are gone.
 * Every branch therefore evaluates the same way.
 *
 * It is kept as a named predicate rather than inlined at the five call sites so
 * the decision stays in one place if a longer test length is ever added.
 */
export function canQuickRestart(): boolean {
  return true;
}
