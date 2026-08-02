import { describe, it, expect, afterEach, vi } from "vitest";
import { setup } from "../../__testData__/controller-test";
import * as PsaDal from "../../../src/dal/psa";
import { ObjectId } from "mongodb";

const { mockApp, uid } = setup();

describe("Psa Controller", () => {
  describe("get psa", () => {
    const getPsaMock = vi.spyOn(PsaDal, "get");

    afterEach(() => {
      getPsaMock.mockClear();
    });

    it("get psas without authorization", async () => {
      //GIVEN
      const psaOne: PsaDal.DBPSA = {
        _id: new ObjectId(),
        message: "test2",
        date: 1000,
        level: 1,
        sticky: true,
      };
      const psaTwo: PsaDal.DBPSA = {
        _id: new ObjectId(),
        message: "test2",
        date: 2000,
        level: 2,
        sticky: false,
      };
      getPsaMock.mockResolvedValue([psaOne, psaTwo]);

      //WHEN
      const { body } = await mockApp.get("/psas").expect(200);

      //THEN
      expect(body).toEqual({
        message: "PSAs retrieved",
        data: [
          {
            _id: psaOne._id.toHexString(),
            date: 1000,
            level: 1,
            message: "test2",
            sticky: true,
          },
          {
            _id: psaTwo._id.toHexString(),
            date: 2000,
            level: 2,
            message: "test2",
            sticky: false,
          },
        ],
      });
    });
    it("get psas with authorization", async () => {
      await mockApp
        .get("/psas")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);
    });
  });
});
