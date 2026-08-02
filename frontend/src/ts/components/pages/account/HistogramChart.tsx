import { Mode } from "@croco-calc/schemas/shared";
import { createMemo, JSXElement } from "solid-js";

import { SnapshotResult } from "../../../constants/default-snapshot";
import { getTheme } from "../../../states/theme";
import { ChartJs } from "../../common/ChartJs";

/**
 * AC-090: the bucket width is a fixed constant rather than the upstream
 * speed-unit-derived bucket size, which no longer exists.
 */
export const HISTOGRAM_BUCKET_SIZE = 10;

export function HistogramChart(props: {
  results: SnapshotResult<Mode>[];
}): JSXElement {
  const buckets = createMemo(() =>
    groupIntoBuckets(
      props.results.map((it) => it.score),
      HISTOGRAM_BUCKET_SIZE,
    ),
  );

  return (
    <div style={{ height: "200px" }}>
      <ChartJs
        name="Histogram"
        type="bar"
        data={{
          datasets: [
            {
              label: "Tests",
              data: buckets(),
              backgroundColor: getTheme().main,
              borderColor: getTheme().main,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          hover: {
            mode: "nearest",
            intersect: false,
          },
          scales: {
            x: {
              axis: "x",
              bounds: "ticks",
              display: true,
              title: {
                display: false,
                text: "Bucket",
              },
            },
            y: {
              axis: "y",
              beginAtZero: true,
              ticks: {
                autoSkip: true,
                autoSkipPadding: 20,
                stepSize: 10,
              },
              display: true,
              title: {
                display: true,
                text: "Tests",
              },
            },
          },
          plugins: {
            annotation: {
              annotations: [],
            },
            tooltip: {
              animation: { duration: 250 },
              intersect: false,
              mode: "index",
            },
          },
        }}
      />
    </div>
  );
}
/**
 * AC-090 — bin `score` values into fixed-width buckets. Exported so the
 * negative-score behaviour required by AC-003 can be asserted directly.
 */
export function groupIntoBuckets(
  arr: number[],
  bucketSize: number,
): { x: string; y: number }[] {
  if (arr.length === 0) return [];
  const buckets: Record<number, number> = {};
  const rounded = arr.map((it) => Math.round(it));
  const bucketStartOf = (value: number): number =>
    Math.floor(value / bucketSize) * bucketSize;

  for (const item of rounded) {
    const bucketStart = bucketStartOf(item);
    buckets[bucketStart] = (buckets[bucketStart] ?? 0) + 1;
  }

  /**
   * AC-003 — `score` MAY be negative, so the axis has to extend below zero
   * whenever any result did. It still starts at zero when nothing is negative,
   * which keeps the common case identical to the reference chart.
   */
  const minBucketStart = Math.min(0, bucketStartOf(Math.min(...rounded)));
  const maxBucketStart = bucketStartOf(Math.max(...rounded));

  const result: { x: string; y: number }[] = [];

  for (
    let start = minBucketStart;
    start <= maxBucketStart;
    start += bucketSize
  ) {
    const end = start + bucketSize - 1;
    const label = `${formatBucketBound(start)}-${formatBucketBound(end)}`;

    result.push({
      x: label,
      y: buckets[start] ?? 0,
    });
  }

  return result;
}

/**
 * C33 — a negative bound renders with U+2212 so that the hyphen separating the
 * two bounds of a bucket label stays unambiguous (`−20-−11`, not `-20--11`).
 */
function formatBucketBound(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `${value}`;
}
