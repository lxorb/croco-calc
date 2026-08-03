import { JSXElement, Show } from "solid-js";

import { DEFERRED_FEATURES } from "../../constants/links";
import { ContactModal } from "./ContactModal";
import { CookiesModal } from "./CookiesModal";
import { ForgotPasswordModal } from "./ForgotPasswordModal";
import { GoogleSignupModal } from "./GoogleSignUpModal";
import { LastSignedOutResultModal } from "./LastSignedOutResultModal";
import { MobileTestConfigModal } from "./MobileTestConfigModal";
import { PbTablesModal } from "./PbTablesModal";
import { RegisterCaptchaModal } from "./RegisterCaptchaModal";
import { ShareTestSettings } from "./ShareTestSettings";
import { SimpleModal } from "./SimpleModal";
import { SupportModal } from "./SupportModal";
import { ThemeModal } from "./ThemeModal";
import { UserReportModal } from "./UserReportModal";
import { VersionHistoryModal } from "./VersionHistoryModal";

/**
 * The mounted modal set (INV-114 KEEP / INV-115 DELETE, CP-190).
 *
 * The prose-prompt pickers, the custom-text tree, the item-count and duration
 * dialogs, tags and config presets are all cut (INV-115), so nothing from
 * those trees is mounted here any more. `ThemeModal` is new UI extracted from
 * the deleted settings page (INV-116, C9).
 *
 * `SupportModal` is mounted only while `DEFERRED_FEATURES.support` is on. Both
 * of its openers are hidden behind the same flag, so leaving it mounted would
 * just be an unreachable dialog; the component file is kept intact so flipping
 * the flag is the only edit needed to bring it back.
 */
export function Modals(): JSXElement {
  return (
    <>
      <VersionHistoryModal />
      <ContactModal />
      <RegisterCaptchaModal />
      <Show when={DEFERRED_FEATURES.support}>
        <SupportModal />
      </Show>
      <ThemeModal />
      <SimpleModal />
      <PbTablesModal />
      <ShareTestSettings />
      <MobileTestConfigModal />
      <CookiesModal />
      <LastSignedOutResultModal />
      <GoogleSignupModal />
      <ForgotPasswordModal />
      <UserReportModal />
    </>
  );
}
