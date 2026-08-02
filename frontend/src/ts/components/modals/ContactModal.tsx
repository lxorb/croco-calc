import { For, JSXElement } from "solid-js";

import { CONTACT_EMAIL } from "../../constants/links";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";

/**
 * CP-151 … CP-156. Mirrors the upstream contact modal; the second
 * business-inquiry address is gone (CP-154) — croco calc has one address and
 * all six buttons `mailto:` it (CP-155), differing only by subject prefix.
 */
const BUTTONS: {
  label: string;
  icon: string;
  subject: string;
}[] = [
  { label: "Question", icon: "ph:question-bold", subject: "[Question] " },
  { label: "Feedback", icon: "ph:chat-dots-bold", subject: "[Feedback] " },
  { label: "Bug Report", icon: "ph:bug-bold", subject: "[Bug] " },
  { label: "Account Help", icon: "ph:user-circle-bold", subject: "[Account] " },
  {
    label: "Business Inquiry",
    icon: "ph:briefcase-bold",
    subject: "[Business] ",
  },
  { label: "Other", icon: "ph:dots-three-bold", subject: "[Other] " },
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
              href={`mailto:${CONTACT_EMAIL}?subject=${button.subject}`}
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
