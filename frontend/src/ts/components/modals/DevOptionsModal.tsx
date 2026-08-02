import { UserNameSchema } from "@croco-calc/schemas/users";
import { createSignal, For, JSXElement } from "solid-js";
import { envConfig } from "virtual:env-config";
import { z } from "zod";

import Ape from "../../ape";
import { signIn } from "../../auth";
import { refetchInboxCollection } from "../../collections/inbox";
import { addXp } from "../../db";
import { toggleCaretDebug } from "../../elements/caret";
import { getInputElement } from "../../input/input-element";
import { hideLoaderBar, showLoaderBar } from "../../states/loader-bar";
import { hideModal, showModal } from "../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { showSimpleModal } from "../../states/simple-modal";
import { toggleUserFakeChartData } from "../../test/result";
import { disableSlowTimerFail } from "../../test/test-timer";
import { setMediaQueryDebugLevel } from "../../ui";
import { remoteValidation } from "../../utils/remote-validation";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";

const [mediaQueryDebugLevel, setLocalMediaQueryDebugLevel] = createSignal(0);

type DevButton = {
  icon: string;
  label: () => string;
  onClick: () => void;
};

export function DevOptionsModal(): JSXElement {
  const buttons: DevButton[] = [
    {
      icon: "ph:database-bold",
      label: () => "Generate Data",
      onClick: () => showGenerateDataModal(),
    },
    {
      icon: "ph:bell-bold",
      label: () => "Test Notifications",
      onClick: () => {
        showSuccessNotification("This is a test", { durationMs: 0 });
        showNoticeNotification("This is a test", { durationMs: 0 });
        showErrorNotification("This is a test", {
          durationMs: 0,
          details: { test: true, error: "Example error message" },
        });
        showNoticeNotification("useInnerHtml<br>test", {
          durationMs: 0,
          useInnerHtml: true,
        });
        hideModal("DevOptions");
      },
    },
    {
      icon: "ph:ruler-bold",
      label: () => `Media Query Debug (${mediaQueryDebugLevel()})`,
      onClick: () => {
        const next =
          mediaQueryDebugLevel() >= 2 ? 0 : mediaQueryDebugLevel() + 1;
        setLocalMediaQueryDebugLevel(next);
        showNoticeNotification(`Setting media query debug level to ${next}`);
        setMediaQueryDebugLevel(next);
      },
    },
    {
      icon: "ph:eye-bold",
      label: () => "Show Real Answer Input",
      onClick: () => {
        const el = getInputElement();
        el.style.opacity = "1";
        el.style.marginTop = "1.5em";
        el.style.caretColor = "red";
        hideModal("DevOptions");
      },
    },
    {
      icon: "ph:sign-in-bold",
      label: () => "Quick Login",
      onClick: () => {
        if (
          envConfig.quickLoginEmail === undefined ||
          envConfig.quickLoginPassword === undefined
        ) {
          showErrorNotification(
            "Quick login credentials not set. Add QUICK_LOGIN_EMAIL and QUICK_LOGIN_PASSWORD to your frontend .env file.",
          );
          return;
        }
        showLoaderBar();
        void signIn(
          envConfig.quickLoginEmail,
          envConfig.quickLoginPassword,
          true,
        )
          .then((result) => {
            if (!result.success) {
              showErrorNotification(result.message);
            }
          })
          .catch((error: unknown) => {
            showErrorNotification("Quick login failed", { error });
          })
          .finally(() => {
            hideLoaderBar();
          });
        hideModal("DevOptions");
      },
    },
    {
      icon: "ph:star-bold",
      label: () => "XP Simple Test",
      onClick: () => {
        setTimeout(() => {
          addXp(1000);
        }, 500);
        hideModal("DevOptions");
      },
    },
    {
      icon: "ph:star-bold",
      label: () => "XP with breakdown Test",
      onClick: () => {
        setTimeout(() => {
          // AC-036 — exactly the six keys the XP bar renders, in order.
          const fakeBreakdown = {
            base: 100,
            fullAccuracy: 10,
            modes: 20,
            accPenalty: 5,
            configMultiplier: 2,
            daily: 10000,
          };
          const totalFakeXp = 10270;
          addXp(totalFakeXp, fakeBreakdown);
        }, 500);
        hideModal("DevOptions");
      },
    },
    {
      icon: "ph:tray-bold",
      label: () => "Add Debug Inbox Item",
      onClick: () => {
        showModal("DevInboxPicker");
      },
    },
    {
      icon: "ph:chart-bar-bold",
      label: () => "Toggle Fake Chart Data",
      onClick: toggleUserFakeChartData,
    },
    {
      icon: "ph:cursor-text-bold",
      label: () => "Toggle Caret Debug",
      onClick: toggleCaretDebug,
    },
    {
      icon: "ph:clock-bold",
      label: () => "Disable Slow Timer Fail",
      onClick: disableSlowTimerFail,
    },
    {
      icon: "ph:test-tube-bold",
      label: () => "Event Log Viewer",
      onClick: () => showModal("EventLogViewer"),
    },
  ];

  // C16 deletes badges, so the contract only offers the two reward types.
  const addDebugInboxItem = (rewardType: "xp" | "none"): void => {
    hideModal("DevInboxPicker");
    void Ape.dev
      .addDebugInboxItem({ body: { rewardType } })
      .then((response) => {
        if (response.status !== 200) {
          showErrorNotification("Failed to add inbox item", {
            details: response.body,
          });
          return;
        }
        showSuccessNotification("Debug inbox item added");
        void refetchInboxCollection();
      });
  };

  return (
    <>
      <AnimatedModal id="DevOptions" title="Dev Options">
        <div class="flex flex-col gap-4">
          <For each={buttons}>
            {(btn) => (
              <Button
                variant="button"
                onClick={btn.onClick}
                icon={{ icon: btn.icon, fixedWidth: true }}
                text={btn.label()}
              />
            )}
          </For>
        </div>
      </AnimatedModal>
      <AnimatedModal id="DevInboxPicker" title="Choose Reward Type">
        <div class="flex flex-col gap-4">
          <Button
            variant="button"
            onClick={() => addDebugInboxItem("xp")}
            icon={{ icon: "ph:star-bold", fixedWidth: true }}
            text="XP Reward (1000)"
          />
          <Button
            variant="button"
            onClick={() => addDebugInboxItem("none")}
            icon={{ icon: "ph:envelope-simple-bold", fixedWidth: true }}
            text="No Reward"
          />
        </div>
      </AnimatedModal>
    </>
  );
}

function showGenerateDataModal(): void {
  showSimpleModal({
    title: "Generate data",
    text: `if create user is checked, user will be created with <name>@example.com and password: password`,
    class: "max-w-2xl",
    schema: z.object({
      username: UserNameSchema,
      createUser: z.boolean(),
      firstTestTimestamp: z.date().max(new Date()).optional(),
      lastTestTimestamp: z.date().max(new Date()).optional(),
      minTestsPerDay: z.number().safe().int().min(0).max(200),
      maxTestsPerDay: z.number().safe().int().min(0).max(200),
    }),
    inputs: {
      createUser: {
        type: "checkbox",
        label: "create user",
        initVal: false,
        description:
          "if checked, user will be created with {username}@example.com and password: password",
      },
      username: {
        type: "text",
        label: "username",
        placeholder: "username",
        validation: {
          isValid: remoteValidation(
            async (name: string) =>
              Ape.users.getNameAvailability({ params: { name } }),
            { check: (data) => !data.available || "Unknown user" },
          ),
          debounceDelay: 1000,
        },
      },
      firstTestTimestamp: {
        type: "date",
        label: "first test",
      },
      lastTestTimestamp: {
        type: "date",
        label: "last test",
      },
      minTestsPerDay: {
        type: "range",
        label: "min tests per day",
        initVal: 0,
        step: 10,
      },
      maxTestsPerDay: {
        type: "range",
        label: "max tests per day",
        initVal: 50,

        step: 10,
      },
    },
    buttonText: "generate (might take a while)",
    execFn: async ({
      username,
      createUser,
      firstTestTimestamp,
      lastTestTimestamp,
      minTestsPerDay,
      maxTestsPerDay,
    }) => {
      const result = await Ape.dev.generateData({
        body: {
          username,
          createUser,
          firstTestTimestamp: firstTestTimestamp?.getTime(),
          lastTestTimestamp: lastTestTimestamp?.getTime(),
          minTestsPerDay,
          maxTestsPerDay,
        },
      });

      return {
        status: result.status === 200 ? "success" : "error",
        message: result.body.message,
      };
    },
  });
}
