import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import * as ConfigDal from "../../../src/dal/config";

const getConfigCollection = ConfigDal.__testing.getConfigCollection;

describe("ConfigDal", () => {
  describe("saveConfig", () => {
    it("should save and update user configuration correctly", async () => {
      //GIVEN
      const uid = new ObjectId().toString();
      await getConfigCollection().insertOne({
        uid,
        config: {
          addition: "100",
          time: 1,
          quickTab: true, //legacy value
        },
      } as any);

      //WHEN
      await ConfigDal.saveConfig(uid, {
        addition: "100",
        difficulty: "normal",
      } as any);

      //WHEN
      await ConfigDal.saveConfig(uid, { addition: "1000" });

      //THEN
      const savedConfig = (await ConfigDal.getConfig(
        uid,
      )) as ConfigDal.DBConfig;

      expect(savedConfig.config.addition).toBe("1000");
      expect(savedConfig.config.time).toBe(1);

      //should remove legacy values
      expect((savedConfig.config as any)["quickTab"]).toBeUndefined();
    });
  });
});
