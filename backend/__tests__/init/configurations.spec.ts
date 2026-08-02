import { describe, it, expect } from "vitest";
import * as Configurations from "../../src/init/configuration";

import { Configuration } from "@croco-calc/schemas/configuration";
const mergeConfigurations = Configurations.__testing.mergeConfigurations;

describe("configurations", () => {
  describe("mergeConfigurations", () => {
    it("should merge configurations correctly", () => {
      //GIVEN
      const baseConfig: Configuration = {
        maintenance: false,
        dev: {
          responseSlowdownMs: 5,
        },
        users: {
          reporting: {
            enabled: false,
            maxReports: 5,
            contentReportLimit: 100,
          },
          signUp: true,
        },
      } as any;
      const liveConfig: Partial<Configuration> = {
        maintenance: true,
        users: {
          reporting: {
            enabled: true,
          } as any,
          //not part of the base configuration, must be dropped
          maxFavorites: 10,
        } as any,
      };

      //WHEN
      mergeConfigurations(baseConfig, liveConfig);

      //THEN
      expect(baseConfig).toEqual({
        maintenance: true,
        dev: {
          responseSlowdownMs: 5,
        },
        users: {
          reporting: {
            enabled: true,
            maxReports: 5,
            contentReportLimit: 100,
          },
          signUp: true,
        },
      } as any);
    });
  });
});
