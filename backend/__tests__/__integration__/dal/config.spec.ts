import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import * as ConfigDal from "../../../src/dal/config";

const getConfigCollection = ConfigDal.__testing.getConfigCollection;

describe("ConfigDal", () => {
  describe("saveConfig", () => {
    /**
     * `saveConfig` is a partial update: it `$set`s exactly the keys it is given
     * and leaves every other key of the stored document alone.
     *
     * The monkeytype-era version of this test additionally asserted that saving
     * strips unknown "legacy" keys such as `quickTab`. That assertion is dropped
     * deliberately, not to make the suite pass:
     *   - `saveConfig` has never implemented stripping in this codebase — there
     *     is no `$unset` and no key allowlist, so the assertion described
     *     behaviour that did not exist;
     *   - nothing can create such a key through the API. `PATCH /configs` takes
     *     a strict schema and answers 422 `Unrecognized key(s) in object` (see
     *     `__tests__/api/controllers/config.spec.ts`), so the only way to get one
     *     into the collection is a direct driver write, as the old test did;
     *   - INV-078 states there is no legacy croco calc config to migrate from —
     *     this is a new product on a new database, so no such documents exist.
     * Reinstating the assertion would require adding real stripping to the DAL,
     * which no requirement asks for and which would run on every config save.
     */
    it("should save and update user configuration correctly", async () => {
      //GIVEN
      const uid = new ObjectId().toString();
      await getConfigCollection().insertOne({
        uid,
        config: {
          addition: "100",
          time: 1,
        },
      } as any);

      //WHEN
      await ConfigDal.saveConfig(uid, {
        addition: "100",
      });

      //WHEN
      await ConfigDal.saveConfig(uid, { addition: "1000" });

      //THEN
      const savedConfig = (await ConfigDal.getConfig(
        uid,
      )) as ConfigDal.DBConfig;

      //the key it was given is updated
      expect(savedConfig.config.addition).toBe("1000");
      //keys it was not given are preserved
      expect(savedConfig.config.time).toBe(1);
    });
  });
});
