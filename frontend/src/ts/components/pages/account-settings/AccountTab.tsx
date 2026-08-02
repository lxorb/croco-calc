import { JSXElement } from "solid-js";

import { getSnapshot } from "../../../states/snapshot";
import { Icon } from "../../common/Icon";
import {
  showOptOutOfLeaderboardsModal,
  showResetPersonalBestsModal,
} from "../../modals/account-settings/ReauthConfirmModals";
import { showUpdateNameModal } from "../../modals/account-settings/UpdateNameModal";
import { Section } from "./utils";

/**
 * AC-166: exactly three sections, in this order. The discord integration section
 * (AC-167) and the streak hour offset section (AC-168 / C17) are both gone.
 */
export function AccountTab(): JSXElement {
  return (
    <>
      <UpdateAccountName />
      <OptOutLeaderboard />
      <ResetPersonalBests />
    </>
  );
}

function UpdateAccountName(): JSXElement {
  return (
    <Section
      title="update account name"
      icon={{ icon: "ph:user-bold" }}
      description=<>
        Change the name of your account.{" "}
        <span class="text-error">You can only do this once every 30 days.</span>
      </>
      button={{
        text: "update name",
        onClick: () => showUpdateNameModal(),
      }}
    />
  );
}

function OptOutLeaderboard(): JSXElement {
  return (
    <Section
      title="opt out of leaderboards"
      icon={{ icon: "ph:crown-bold" }}
      description=<>
        Removes your account from every croco calc leaderboard and stops your
        results from being submitted to them.{" "}
        <span class="text-error">You can&apos;t undo this action!</span>
      </>
      button={{
        text: "opt out",
        onClick: () => showOptOutOfLeaderboardsModal(),
      }}
      disabled={getSnapshot()?.lbOptOut === true}
      disabledDescription=<>
        <Icon icon="ph:warning-bold" />
        You have opted out of leaderboards.
      </>
    />
  );
}

function ResetPersonalBests(): JSXElement {
  return (
    <Section
      title="reset personal bests"
      icon={{ icon: "ph:crown-bold" }}
      description=<>
        Resets all your personal bests (but doesn&apos;t delete any tests from
        your history). <span class="text-error">You can&apos;t undo this!</span>
      </>
      button={{
        text: "reset personal bests",
        onClick: () => showResetPersonalBestsModal(),
      }}
    />
  );
}
