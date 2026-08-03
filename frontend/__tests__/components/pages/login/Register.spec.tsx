import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * The sign-up form's fields.
 *
 * The user's report: "remove the verify email field for registration". The form
 * used to ask for the address twice and refuse to submit until the two boxes
 * matched — a re-entry guard that costs every visitor a second typing of their
 * address and buys almost nothing, because a mistyped address is caught the
 * moment the verification mail does not arrive.
 *
 * ## What is NOT being tested away
 *
 * This is about the **form field only**. Firebase still sends its verification
 * mail on sign-up (`auth.tsx` → `sendEmailVerification`), `email-handler.html`
 * still handles the `verifyEmail` action code, and the "please verify your
 * email" state is untouched. Nothing in this file asserts anything about that
 * flow, and nothing in this change went near it.
 *
 * The account-settings "update email" flow is a **different component**
 * (`modals/account-settings/UpdateEmailModal.tsx`, with its own `emailConfirm`
 * input) and deliberately keeps its confirmation box: re-typing an address you
 * are moving an existing account *away from* is a genuine safeguard, because
 * there the wrong address locks you out of an account that already exists.
 */

vi.mock("../../../../src/ts/firebase", () => ({
  app: undefined,
  Auth: undefined,
}));

vi.mock("../../../../src/ts/auth", () => ({
  getPasswordSchema: () => z.string().min(8),
  signUp: vi.fn(),
}));

vi.mock("../../../../src/ts/ape", () => ({
  default: {
    users: {
      getNameAvailability: vi.fn(async () => ({
        status: 200,
        body: { data: { available: true } },
      })),
    },
  },
}));

vi.mock("../../../../src/ts/components/modals/RegisterCaptchaModal", () => ({
  showRegisterCaptchaModal: vi.fn(async () => "token"),
}));

vi.mock("../../../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
  showNoticeNotification: vi.fn(),
}));

const { Register } =
  await import("../../../../src/ts/components/pages/login/Register");

/** Every `<input>` the form renders, in document order. */
function inputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll("input")];
}

describe("the registration form", () => {
  it("asks for the email address exactly once", () => {
    const { container } = render(() => <Register />);

    const emailish = inputs(container).filter((input) =>
      /email/i.test(input.placeholder),
    );

    expect(emailish.map((input) => input.placeholder)).toEqual(["email"]);
  });

  it("has no confirm-your-email box left behind", () => {
    // `container`, never `document` — `__harness__/mock-dom.ts` stubs
    // `document.querySelector` to always hand back a fresh `<div>`, so a
    // `toBeNull()` against it passes and fails for the same reason: never.
    const { container } = render(() => <Register />);

    // The removed field, by every handle it had: its placeholder, its
    // autocomplete token and its form key.
    expect(
      container.querySelector('input[placeholder="verify email"]'),
    ).toBeNull();
    expect(
      container.querySelector('input[autocomplete="verify-email"]'),
    ).toBeNull();
    expect(container.querySelector('input[name="emailVerify"]')).toBeNull();
  });

  it("keeps the four fields it should have, in a sensible tab order", () => {
    const { container } = render(() => <Register />);

    // username → email → password → verify password → submit. Nothing is
    // `tabindex`-reordered, so document order is tab order.
    expect(inputs(container).map((input) => input.placeholder)).toEqual([
      "username",
      "email",
      "password",
      "verify password",
    ]);
  });

  /**
   * The error text ends up in the `aria-label` of the `Balloon` that
   * `FieldIndicator` renders beside the input, so that is what "the field
   * complained" looks like from the outside.
   */
  const emailComplaint = (container: HTMLElement): string | null | undefined =>
    // Scoped to the email field's own wrapper (`InputField` renders the input
    // and its indicator as siblings), so a complaint from `username` can never
    // stand in for one from `email`.
    container
      .querySelector('input[name="email"]')
      ?.parentElement?.querySelector('[data-balloon-pos="left"]')
      ?.getAttribute("aria-label");

  it("still validates the one email field it has", async () => {
    const { container } = render(() => <Register />);
    const email = inputs(container).find(
      (input) => input.placeholder === "email",
    ) as HTMLInputElement;

    // `fromSchema(UserEmailSchema)` is still wired to `onChange`, so a
    // malformed address is rejected — removing the *second* box must not have
    // taken the first one's validation with it.
    fireEvent.input(email, { target: { value: "not-an-email" } });
    fireEvent.blur(email);

    await vi.waitFor(() => {
      expect(emailComplaint(container)).toBeTruthy();
    });
  });

  it("accepts a well-formed address", async () => {
    const { container } = render(() => <Register />);
    const email = inputs(container).find(
      (input) => input.placeholder === "email",
    ) as HTMLInputElement;

    fireEvent.input(email, { target: { value: "someone@example.com" } });
    fireEvent.blur(email);

    // No "verify email not matching email" left to trip over: a single,
    // well-formed address is now enough for this field to be satisfied.
    await vi.waitFor(() => {
      expect(emailComplaint(container)).toBeFalsy();
    });
  });

  it("does not keep the password confirmation, which is a different decision", () => {
    // Guard against an over-eager "remove the duplicate field" follow-up: a
    // password is masked, so re-entry is the only way to catch a typo before
    // the account exists. Only the *email* duplicate was redundant.
    expect(
      render(() => <Register />).container.querySelector(
        'input[autocomplete="verify-password"]',
      ),
    ).not.toBeNull();
  });
});
