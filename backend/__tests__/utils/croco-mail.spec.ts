import { describe, it, expect } from "vitest";
import { buildCrocoMail } from "../../src/utils/croco-mail";

describe("Croco Mail", () => {
  it("should properly create a mail object", () => {
    const mailConfig = {
      subject: "",
      body: "",
      timestamp: Date.now(),
    };

    const mail = buildCrocoMail(mailConfig) as any;

    expect(mail.id).toBeDefined();
    expect(mail.subject).toBe("");
    expect(mail.body).toBe("");
    expect(mail.timestamp).toBeDefined();
    expect(mail.read).toBe(false);
    expect(mail.rewards).toEqual([]);
  });
});
