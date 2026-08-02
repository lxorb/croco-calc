import { For, JSXElement } from "solid-js";

import { CONTACT_EMAIL, SUPPORT_EMAIL } from "../../constants/links";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";

/**
 * CP-151 … CP-156. Mirrors monkeytype's contact modal; the second
 * business-inquiry address is gone (CP-154) — croco calc routes everything
 * through `CONTACT_EMAIL`, with bug and account traffic going to
 * `SUPPORT_EMAIL`.
 */
const BUTTONS: {
  label: string;
  icon: string;
  subject: string;
  to: string;
}[] = [
  {
    label: "Question",
    icon: "ph:question-bold",
    subject: "[Question] ",
    to: CONTACT_EMAIL,
  },
  {
    label: "Feedback",
    icon: "ph:chat-dots-bold",
    subject: "[Feedback] ",
    to: CONTACT_EMAIL,
  },
  {
    label: "Bug Report",
    icon: "ph:bug-bold",
    subject: "[Bug] ",
    to: SUPPORT_EMAIL,
  },
  {
    label: "Account Help",
    icon: "ph:user-circle-bold",
    subject: "[Account] ",
    to: SUPPORT_EMAIL,
  },
  {
    label: "Business Inquiry",
    icon: "ph:briefcase-bold",
    subject: "[Business] ",
    to: CONTACT_EMAIL,
  },
  {
    label: "Other",
    icon: "ph:dots-three-bold",
    subject: "[Other] ",
    to: CONTACT_EMAIL,
  },
];

export function ContactModal(): JSXElement {
  const buttonClass = " gap-4 text-md p-4 text-lg justify-start";

  return (
    <AnimatedModal id="Contact" modalClass="max-w-4xl" title="Contact">
      <div>
        Feel free to send an email to {CONTACT_EMAIL} (the buttons below will
        open your default mail client).
        <br />
        <br />
        Please <span class="text-error">do not send</span> requests to delete
        your account, update your email, update your name or clear personal
        bests - you can do that on the{" "}
        <a href="/account-settings">account settings</a> page.
      </div>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <For each={BUTTONS}>
          {(button) => (
            <Button
              variant="button"
              href={`mailto:${button.to}?subject=${button.subject}`}
              text={button.label}
              class={buttonClass}
              icon={{
                icon: button.icon,
                fixedWidth: true,
              }}
            />
          )}
        </For>
      </div>
    </AnimatedModal>
  );
}
