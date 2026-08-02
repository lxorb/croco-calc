import { buildSettingsId } from "@croco-calc/schemas/math";
import { createMemo } from "solid-js";

import { getConfig } from "../../../../config/store";
import { getLocalPB } from "../../../../db";
import { isAuthenticated } from "../../../../states/core";
import { getSnapshot } from "../../../../states/snapshot";
import { Notice } from "./Notice";

/**
 * The personal best for the current `(mode2, settingsId)` pair — the key that
 * master C31 reduces CP-110, AC-065 and assumption A-12 to.
 */
export function PbNotice() {
  const displayText = createMemo(() => {
    if (!isAuthenticated()) return "";

    //react on a new localPB
    const _snapshot = getSnapshot();

    const settingsId = buildSettingsId({
      addition: getConfig.addition,
      multiplication: getConfig.multiplication,
      division: getConfig.division,
      fractionAddition: getConfig.fractionAddition,
      fractionMultiplication: getConfig.fractionMultiplication,
      decimals: getConfig.decimals,
      negatives: getConfig.negatives,
    });

    const pb = getLocalPB(`${getConfig.time}`, settingsId);

    if (pb === undefined) return "no pb";

    return `${Math.round(pb.score)} ${Math.round(pb.acc)}% acc`;
  });

  return (
    <Notice
      when={isAuthenticated() && getConfig.showPb}
      icon="ph:crown-bold"
      openCommandline="showPb"
      text={displayText()}
    />
  );
}
