import { navigate } from "../../controllers/route-controller";
import { showModal } from "../../states/modals";
import { isAuthenticated } from "../../states/core";
import { toggleFullscreen } from "../../utils/misc";
import { Command, withValidation } from "../types";
import { remoteValidation } from "../../utils/remote-validation";
import { UserNameWithoutFilterSchema } from "@croco-calc/schemas/users";
import Ape from "../../ape";

const commands: Command[] = [
  {
    id: "viewTestPage",
    display: "View Test Page",
    alias: "navigate go to start begin test",
    icon: "ph:calculator-bold",
    exec: (): void => {
      void navigate("/");
    },
  },
  {
    id: "viewLeaderboards",
    display: "View Leaderboards",
    alias: "navigate go to",
    icon: "ph:crown-bold",
    exec: (): void => {
      void navigate("/leaderboards");
    },
  },
  {
    id: "viewAbout",
    display: "View About Page",
    alias: "navigate go to",
    icon: "ph:info-bold",
    exec: (): void => {
      void navigate("/about");
    },
  },
  /**
   * Master C9 — the monkeytype settings page is deleted, its theme picker was
   * extracted into a modal, and the `settings` nav item now opens that modal.
   * The palette entry follows the nav item rather than pointing at a dead
   * `/settings` route.
   */
  {
    id: "viewSettings",
    display: "Change theme",
    alias: "navigate go to settings theme appearance colors",
    icon: "ph:gear-bold",
    opensModal: true,
    exec: (): void => {
      showModal("Theme");
    },
  },

  {
    id: "viewAccount",
    display: "View Account Page",
    alias: "navigate go to stats",
    icon: "ph:user-bold",
    exec: (): void => {
      isAuthenticated() ? void navigate("/account") : void navigate("/login");
    },
  },
  withValidation({
    id: "searchProfile",
    display: "Search for a profile",
    alias: "profile user search find lookup",
    icon: "ph:magnifying-glass-bold",
    input: true,
    validation: {
      schema: UserNameWithoutFilterSchema,
      debounceDelay: 1000,
      isValid: remoteValidation(
        async (name) => Ape.users.getProfile({ params: { uidOrName: name } }),
        {
          on4xx: () => "Unknown user",
        },
      ),
    },
    exec: ({ input }): void => {
      if (input === undefined) return;
      void navigate(`/profile/${input}`);
    },
  }),
  {
    id: "toggleFullscreen",
    display: "Toggle Fullscreen",
    icon: "ph:arrows-out-bold",
    exec: (): void => {
      toggleFullscreen();
    },
  },
];

export default commands;
