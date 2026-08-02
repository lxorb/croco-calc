import { CompletedEvent } from "@croco-calc/schemas/results";
import { Mode } from "@croco-calc/schemas/shared";
import objectHash from "object-hash";
import { createMemo, JSX } from "solid-js";

import Ape from "../../ape";
import { getConfig } from "../../config/store";
import { SnapshotResult } from "../../constants/default-snapshot";
import { saveLocalResult, SaveLocalResultData } from "../../db";
import { authEvent } from "../../events/auth";
import { getAuthenticatedUser } from "../../firebase";
import { hideModal, showModal } from "../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import {
  getLastSignedOutResult,
  setLastSignedOutResult,
} from "../../states/test";
import { cn } from "../../utils/cn";
import { Formatting } from "../../utils/format";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";
import { Separator } from "../common/Separator";
import { enabledSettings, settingBalloon } from "../pages/account/utils";

const modalId = "LastSignedOutResult";

export function LastSignedOutResultModal() {
  const format = createMemo(
    () =>
      new Formatting({
        alwaysShowDecimalPlaces: getConfig.alwaysShowDecimalPlaces,
      }),
  );

  const handleDiscard = () => {
    showNoticeNotification("Last test result discarded");
    hideModal(modalId);
    setTimeout(() => {
      setLastSignedOutResult(null);
    }, 125);
  };

  const handleSave = () => {
    void syncLastSignedOutResult();
  };

  return (
    <AnimatedModal
      id={modalId}
      title="Last signed out result"
      modalClass="max-w-2xl"
    >
      <p class="">Would you like to save it?</p>
      <Separator />

      <div class="grid grid-cols-2 gap-2">
        {/* AC-007: score / accuracy / tpm / correct-wrong; no raw, consistency
        or character stats anywhere. */}
        <Value
          class="text-2xl"
          label="score"
          value={format().score(getLastSignedOutResult()?.score ?? 0)}
        />
        <Value
          class="text-2xl"
          label="accuracy"
          value={format().accuracy(getLastSignedOutResult()?.acc ?? 0)}
        />
        <Value
          label="tpm"
          value={format().tpm(getLastSignedOutResult()?.tpm ?? 0, {
            showDecimalPlaces: true,
          })}
        />
        <Value
          label="correct/wrong"
          value={`${getLastSignedOutResult()?.correct ?? 0}/${
            getLastSignedOutResult()?.wrong ?? 0
          }`}
        />
        <Value
          label="test type"
          class="col-span-2"
          value={formatTestType(getLastSignedOutResult())}
        />
      </div>
      {/*
      need two sets of buttons here because on wide screens tab focuses save first
      but on small screens tab focuses discard first
      */}
      <div class="grid grid-cols-1 gap-2 sm:hidden">
        <Button text="save" onClick={handleSave} />
        <Button text="discard" onClick={handleDiscard} />
      </div>
      <div class="hidden grid-cols-2 gap-2 sm:grid">
        <Button text="discard" onClick={handleDiscard} />
        <Button text="save" onClick={handleSave} />
      </div>
    </AnimatedModal>
  );
}

function Value(props: {
  label: string;
  value: string | (string | JSX.Element)[];
  class?: string;
}) {
  return (
    <div class={cn("flex flex-col text-sm", props.class)}>
      <span class="text-em-xs text-sub">{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

/**
 * AC-102's rule: one line per enabled setting, labelled by mapping the stored
 * C2 literal through the shared table. Language, punctuation, numbers, blind,
 * lazy, funbox, difficulty and tags are all gone with C15 / C22 / AC-007.
 */
function formatTestType(r: CompletedEvent | null): (string | JSX.Element)[] {
  if (r === null) return ["-"];
  const tt: (string | JSX.Element)[] = [`${r.mode} ${r.mode2}`];

  for (const { key, value } of enabledSettings(r.settings)) {
    tt.push(<br />, settingBalloon(key, value));
  }

  return tt;
}

async function syncLastSignedOutResult(): Promise<void> {
  const user = getAuthenticatedUser();
  const lastResult = getLastSignedOutResult();
  if (user === null) {
    showNoticeNotification(
      "Failed to save last test result: user not authenticated",
    );
    hideModal(modalId);
    return;
  }
  if (lastResult === null) {
    showNoticeNotification("Failed to save last test result: no last result");
    hideModal(modalId);
    return;
  }

  const updatedResult = updateUidAndHash(user.uid, lastResult);
  const response = await Ape.results.add({ body: { result: updatedResult } });

  if (response.status !== 200) {
    showErrorNotification(`Failed to save last result`, {
      response,
    });
    hideModal(modalId);
    return;
  }

  //TODO - this type cast was not needed before because we were using JSON cloning
  // but now with the stronger types it shows that we are forcing completed event
  // into a snapshot result - might not cause issues but worth investigating
  const result = structuredClone(
    updatedResult,
  ) as unknown as SnapshotResult<Mode>;

  const dataToSave: SaveLocalResultData = {
    xp: response.body.data.xp,
    result,
    isPb: response.body.data.isPb,
  };

  result._id = response.body.data.insertedId;
  if (response.body.data.isPb) {
    result.isPb = true;
  }
  saveLocalResult(dataToSave);
  setLastSignedOutResult(null);
  showSuccessNotification(
    `Last test result saved ${response.body.data.isPb ? `(new pb!)` : ""}`,
  );
  hideModal(modalId);
}

export function updateUidAndHash(
  uid: string,
  notSignedInLastResult: CompletedEvent,
): CompletedEvent {
  notSignedInLastResult.uid = uid;
  //@ts-expect-error really need to delete this
  delete notSignedInLastResult.hash;
  notSignedInLastResult.hash = objectHash(notSignedInLastResult);
  return notSignedInLastResult;
}

authEvent.subscribe((event) => {
  if (event.type === "snapshotUpdated" && event.data.isInitial) {
    if (getLastSignedOutResult() !== null) {
      showModal(modalId);
    }
  }
});
