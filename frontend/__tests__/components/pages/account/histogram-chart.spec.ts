import { describe, it, expect } from "vitest";
import {
  groupIntoBuckets,
  HISTOGRAM_BUCKET_SIZE,
} from "../../../../src/ts/components/pages/account/HistogramChart";

describe("HistogramChart", () => {
  describe("groupIntoBuckets", () => {
    it("AC-090: defaults to ten-point buckets", () => {
      expect(HISTOGRAM_BUCKET_SIZE).toBe(10);
    });

    it("returns nothing for an empty result set", () => {
      expect(groupIntoBuckets([], HISTOGRAM_BUCKET_SIZE)).toEqual([]);
    });

    it("AC-090: bins non-negative scores from zero upwards", () => {
      expect(groupIntoBuckets([0, 4, 12, 25], HISTOGRAM_BUCKET_SIZE)).toEqual([
        { x: "0-9", y: 2 },
        { x: "10-19", y: 1 },
        { x: "20-29", y: 1 },
      ]);
    });

    it("AC-090: keeps the axis at zero when every score is well above it", () => {
      expect(groupIntoBuckets([31, 33], HISTOGRAM_BUCKET_SIZE)).toEqual([
        { x: "0-9", y: 0 },
        { x: "10-19", y: 0 },
        { x: "20-29", y: 0 },
        { x: "30-39", y: 2 },
      ]);
    });

    it("AC-003: counts negative scores instead of dropping them", () => {
      const buckets = groupIntoBuckets([-15, -3, 0, 7], HISTOGRAM_BUCKET_SIZE);

      expect(buckets).toEqual([
        { x: "−20-−11", y: 1 },
        { x: "−10-−1", y: 1 },
        { x: "0-9", y: 2 },
      ]);
      expect(buckets.reduce((sum, it) => sum + it.y, 0)).toBe(4);
    });

    it("AC-003: handles a result set that is entirely negative", () => {
      expect(groupIntoBuckets([-25, -21], HISTOGRAM_BUCKET_SIZE)).toEqual([
        { x: "−30-−21", y: 2 },
      ]);
    });

    it("rounds fractional values before binning", () => {
      expect(groupIntoBuckets([9.6, -0.4], HISTOGRAM_BUCKET_SIZE)).toEqual([
        { x: "0-9", y: 1 },
        { x: "10-19", y: 1 },
      ]);
    });
  });
});
