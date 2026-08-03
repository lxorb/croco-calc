import { UserEmailSchema } from "@croco-calc/schemas/users";
import { tryCatch } from "@croco-calc/util/trycatch";
import { createForm } from "@tanstack/solid-form";

import { sendPasswordResetEmail } from "../../firebase";
import { hideLoaderBar, showLoaderBar } from "../../states/loader-bar";
import { hideModal } from "../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { AnimatedModal } from "../common/AnimatedModal";
import { Captcha } from "../ui/form/Captcha";
import { InputField } from "../ui/form/InputField";
import { SubmitButton } from "../ui/form/SubmitButton";
import { allFieldsMandatory, fromSchema } from "../ui/form/utils";

export function ForgotPasswordModal() {
  const form = createForm(() => ({
    defaultValues: {
      email: "",
      captcha: "",
    },
    onSubmitInvalid: () => {
      showNoticeNotification("Please fill in all fields");
    },
    onSubmit: async ({ value }) => {
      await apply(value);
      form.reset();
    },
    validators: {
      onChange: allFieldsMandatory(),
    },
  }));

  return (
    <AnimatedModal id="ForgotPassword" title="Forgot password" mode="dialog">
      <form
        class="flex flex-col justify-center gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="email"
          validators={{
            onChange: fromSchema(UserEmailSchema, {
              convert: (it) => it?.trim(),
            }),
          }}
          children={(field) => (
            <InputField field={field} placeholder="email" type="email" />
          )}
        />

        <form.Field
          name="captcha"
          children={(field) => <Captcha field={field} />}
        />

        <SubmitButton form={form} text="request password reset" />
      </form>
    </AnimatedModal>
  );
}

/**
 * C24 / INF-053a: there is no backend endpoint for this — Firebase Auth sends
 * the reset mail itself and only the client SDK can trigger it. The captcha
 * (INF-105) therefore stays as a client-side gate only: it still has to be
 * solved before the form submits, but nothing verifies it server-side, because
 * no request reaches our server. Firebase applies its own abuse throttling.
 */
async function apply(options: {
  email: string;
  captcha: string;
}): Promise<void> {
  const { email, captcha } = options;

  if (email === undefined || email === "") {
    showNoticeNotification("Please enter your email address");
    return;
  }

  if (captcha === undefined || captcha === "") {
    showNoticeNotification("Please complete the captcha");
    return;
  }

  showLoaderBar();
  const { error } = await tryCatch(sendPasswordResetEmail(email));
  hideLoaderBar();

  if (error !== null) {
    showErrorNotification("Failed to send password reset email", { error });
    return;
  }

  showSuccessNotification(
    "If an account exists for that email address, a password reset link is on its way",
    { durationMs: 5000 },
  );

  hideModal("ForgotPassword");
}
