import { createMemo, JSXElement } from "solid-js";

import { useUserAverage10LiveQuery } from "../../../../collections/results";
import { getConfig } from "../../../../config/store";
import { isAuthenticated } from "../../../../states/core";
import { Notice } from "./Notice";

/**
 * The rolling average of the last ten results for the current settings.
 * croco calc's headline metric is `score`, not wpm (master C40), so the
 * readout reads `<score> avg <acc>% acc`.
 */
export function AverageNotice(): JSXElement {
  const last10 = useUserAverage10LiveQuery({
    isEnabled: () => isAuthenticated() && getConfig.showAverage !== "off",
  });

  const displayText = createMemo(() => {
    const average = last10();
    if (average === undefined) return "no average";

    const parts: string[] = [];

    if (getConfig.showAverage === "both" || getConfig.showAverage === "speed") {
      parts.push(`${Math.round(average.score ?? 0)} avg`);
    }

    if (getConfig.showAverage === "both" || getConfig.showAverage === "acc") {
      parts.push(`${Math.round(average.acc ?? 0)}% acc`);
    }

    return parts.join(" ");
  });

  return (
    <Notice
      when={isAuthenticated() && getConfig.showAverage !== "off"}
      icon="ph:chart-bar-bold"
      openCommandline="showAverage"
      text={displayText()}
    />
  );
}
