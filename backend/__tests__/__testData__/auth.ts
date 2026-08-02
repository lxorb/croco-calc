import { expect, vi } from "vitest";
import { DecodedIdToken } from "firebase-admin/auth";
import * as AuthUtils from "../../src/utils/auth";

export type BearerAuthenticationMock = {
  /**
   * Reset the mock and return a default token. Call this method in the `beforeEach` of all tests.
   */
  beforeEach: () => void;
  /**
   * Reset the mock results in the authentication to fail.
   */
  noAuth: () => void;
  /**
   * verify the authentication has been called
   */
  expectToHaveBeenCalled: () => void;
  /**
   * modify the token returned by the mock. This can be used to e.g. return a stale token.
   * @param customize
   */
  modifyToken: (customize: Partial<DecodedIdToken>) => void;
};
export function mockBearerAuthentication(
  uid: string,
): BearerAuthenticationMock {
  const mockDecodedToken = {
    uid,
    email: "newuser@mail.com",
    iat: Date.now(),
  } as DecodedIdToken;
  const verifyIdTokenMock = vi.spyOn(AuthUtils, "verifyIdToken");

  return {
    beforeEach: (): void => {
      verifyIdTokenMock.mockClear();
      verifyIdTokenMock.mockResolvedValue(mockDecodedToken);
    },

    noAuth: (): void => {
      verifyIdTokenMock.mockClear();
    },

    expectToHaveBeenCalled: (): void => {
      expect(verifyIdTokenMock).toHaveBeenCalled();
    },

    modifyToken: (customize: Partial<DecodedIdToken>): void => {
      verifyIdTokenMock.mockClear();
      verifyIdTokenMock.mockResolvedValue({
        ...mockDecodedToken,
        ...customize,
      });
    },
  };
}
