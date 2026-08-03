import { describe, it, expect, afterEach, vi } from "vitest";
import { setup } from "../../__testData__/controller-test";
import * as ConfigDal from "../../../src/dal/config";
import { ObjectId } from "mongodb";

const { mockApp, uid } = setup();

describe("ConfigController", () => {
  describe("get config", () => {
    const getConfigMock = vi.spyOn(ConfigDal, "getConfig");

    afterEach(() => {
      getConfigMock.mockClear();
    });

    it("should get the users config", async () => {
      //GIVEN
      getConfigMock.mockResolvedValue({
        _id: new ObjectId(),
        uid: uid,
        config: { addition: "1000" },
      });

      //WHEN
      const { body } = await mockApp
        .get("/configs")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toStrictEqual({
        message: "Configuration retrieved",
        data: { addition: "1000" },
      });

      expect(getConfigMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("update config", () => {
    const saveConfigMock = vi.spyOn(ConfigDal, "saveConfig");

    afterEach(() => {
      saveConfigMock.mockClear();
    });

    it("should update the users config", async () => {
      //GIVEN
      saveConfigMock.mockResolvedValue({} as any);

      //WHEN
      const { body } = await mockApp
        .patch("/configs")
        .set("Authorization", `Bearer ${uid}`)
        .accept("application/json")
        .send({ addition: "1000" })
        .expect(200);

      //THEN
      expect(body).toStrictEqual({
        message: "Config updated",
        data: null,
      });

      expect(saveConfigMock).toHaveBeenCalledWith(uid, {
        addition: "1000",
      });
    });
    /**
     * TR-210 / TR-260 — rewritten, not deleted. This case used to assert a 422
     * on an unknown key. That behaviour is struck: a browser holding a cached
     * SPA build keeps sending keys that build knew about, so rejecting the
     * whole request means the user cannot save *any* setting — including the
     * ones that still exist — until they hard-refresh.
     *
     * The replacement assertion is stronger than the one it replaces. It is not
     * enough that the request succeeds; the stale key must not reach Mongo
     * either, which `saveConfig`'s dotted `$set` would otherwise persist
     * forever. So the argument the DAL receives is checked exactly.
     */
    it("strips a removed config key instead of rejecting the save", async () => {
      //GIVEN
      saveConfigMock.mockResolvedValue({} as any);

      //WHEN — `smoothCaret` is a real key a cached build still sends (TR-203).
      const { body } = await mockApp
        .patch("/configs")
        .set("Authorization", `Bearer ${uid}`)
        .accept("application/json")
        .send({ addition: "1000", smoothCaret: "medium", unknownValue: "x" })
        .expect(200);

      //THEN
      expect(body).toStrictEqual({
        message: "Config updated",
        data: null,
      });

      expect(saveConfigMock).toHaveBeenCalledWith(uid, {
        addition: "1000",
      });
    });
    it("should fail with invalid configs", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/configs")
        .set("Authorization", `Bearer ${uid}`)
        .accept("application/json")
        // `confidenceMode` was a typing-only key and is gone; `addition` is the
        // croco calc equivalent enum (C2 canonical stored literals).
        .send({ autoSwitchTheme: "yes", addition: "pretty" })
        .expect(422);

      //THEN
      expect(body).toStrictEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"addition" Invalid enum value. Expected 'off' | '100' | '1000', received 'pretty'`,
          `"autoSwitchTheme" Expected boolean, received string`,
        ],
      });

      expect(saveConfigMock).not.toHaveBeenCalled();
    });
  });
  describe("delete config", () => {
    const deleteConfigMock = vi.spyOn(ConfigDal, "deleteConfig");

    afterEach(() => {
      deleteConfigMock.mockClear();
    });

    it("should delete the users config", async () => {
      //GIVEN
      deleteConfigMock.mockResolvedValue();

      //WHEN

      const { body } = await mockApp
        .delete("/configs")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toStrictEqual({
        message: "Config deleted",
        data: null,
      });

      expect(deleteConfigMock).toHaveBeenCalledWith(uid);
    });
  });
});
