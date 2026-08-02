import { PSA } from "@croco-calc/schemas/psas";
import { IdSchema } from "@croco-calc/schemas/util";
import { isSafeNumber } from "@croco-calc/util/numbers";
import { tryCatch } from "@croco-calc/util/trycatch";
import { format } from "date-fns/format";
import { Show } from "solid-js";
import { z } from "zod";

import Ape from "../ape";
import { STATUS_PAGE_URL } from "../constants/links";
import { authEvent } from "../events/auth";
import { addBanner } from "../states/banners";
import { addPsa } from "../states/psas";
import { secondsToString } from "../utils/date-and-time";
import { isDevEnvironment } from "../utils/env";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";

const confirmedPSAs = new LocalStorageWithSchema({
  key: "confirmedPSAs",
  schema: z.array(IdSchema),
  fallback: [],
});

function clearMemory(): void {
  confirmedPSAs.set([]);
}

function getMemory(): string[] {
  return confirmedPSAs.get();
}

function setMemory(id: string): void {
  const list = getMemory();
  list.push(id);
  confirmedPSAs.set(list);
}

async function getLatest(): Promise<PSA[] | null> {
  const response = await Ape.psas.get();

  if (response.status === 500) {
    if (isDevEnvironment()) {
      addBanner({
        level: "notice",
        text: "Dev Info: Backend server not running",
        icon: "ph:warning-bold",
      });
    } else {
      type InstatusSummary = {
        page: {
          name: string;
          url: string;
          status: string;
        };
        activeIncidents: {
          id: string;
          name: string;
          started: string;
          status: string;
          impact: string;
          url: string;
          updatedAt: string;
        }[];
        activeMaintenances:
          | {
              id: string;
              name: string;
              start: string;
              status: "NOTSTARTEDYET" | "INPROGRESS" | "COMPLETED";
              duration: number;
              url: string;
              updatedAt: string;
            }[]
          | undefined;
      };

      let maintenanceData: undefined | InstatusSummary["activeMaintenances"];

      // No status page is provisioned yet (`STATUS_PAGE_URL` is null), so there
      // is nothing to ask. Skipping the request keeps a dead host off the boot
      // path; the generic outage banner below still fires.
      if (STATUS_PAGE_URL !== null) {
        const { data: summary, error } = await tryCatch(
          fetch(`${STATUS_PAGE_URL}/summary.json`),
        );

        if (error) {
          console.log("Failed to fetch the status summary", error);
        } else {
          const summaryData =
            (await summary.json()) as unknown as InstatusSummary;

          maintenanceData = summaryData.activeMaintenances;
        }
      }

      if (
        maintenanceData !== undefined &&
        maintenanceData.length > 0 &&
        maintenanceData[0]?.status === "INPROGRESS"
      ) {
        addBanner({
          level: "error",
          customContent: (
            <>
              Server is currently offline for scheduled maintenance.{" "}
              <a target="_blank" href={maintenanceData[0].url}>
                Check the status page
              </a>{" "}
              for more info.
            </>
          ),
          icon: "ph:megaphone-bold",
        });
      } else {
        addBanner({
          level: "error",
          icon: "ph:warning-bold",
          customContent: (
            <>
              Looks like the server is experiencing unexpected down time.
              <br />
              <Show
                when={STATUS_PAGE_URL}
                fallback={<>Please try again in a few minutes.</>}
              >
                {(url) => (
                  <>
                    Check the{" "}
                    <a target="_blank" href={url()}>
                      status page
                    </a>{" "}
                    for more information.
                  </>
                )}
              </Show>
            </>
          ),
        });
      }
    }
    return null;
  } else if (response.status === 503) {
    addBanner({
      level: "error",
      icon: "ph:megaphone-bold",
      customContent: (
        <>
          Server is currently under maintenance.{" "}
          <Show when={STATUS_PAGE_URL} fallback={<>Please try again later.</>}>
            {(url) => (
              <>
                <a target="_blank" href={url()}>
                  Check the status page
                </a>{" "}
                for more info.
              </>
            )}
          </Show>
        </>
      ),
    });
    return null;
  } else if (response.status !== 200) {
    return null;
  }
  return response.body.data;
}

export async function show(): Promise<void> {
  const latest = await getLatest();
  if (latest === null) return;
  if (latest.length === 0) {
    clearMemory();
    return;
  }
  const localmemory = getMemory();
  latest.forEach((psa) => {
    if (isSafeNumber(psa.date)) {
      const dateObj = new Date(psa.date);
      const diff = psa.date - Date.now();
      const string = secondsToString(
        diff / 1000,
        false,
        false,
        "text",
        false,
        true,
      );
      psa.message = psa.message.replace("{dateDifference}", string);
      psa.message = psa.message.replace(
        "{dateNoTime}",
        format(dateObj, "dd MMM yyyy"),
      );
      psa.message = psa.message.replace(
        "{date}",
        format(dateObj, "dd MMM yyyy HH:mm"),
      );
    }

    addPsa(psa.message, psa.level ?? -1);

    if (localmemory.includes(psa._id) && !(psa.sticky ?? false)) {
      return;
    }

    let level: "error" | "notice" | "success";
    if (psa.level === -1) {
      level = "error";
    } else if (psa.level === 1) {
      level = "success";
    } else {
      level = "notice";
    }

    addBanner({
      level,
      text: psa.message,
      icon: "ph:megaphone-bold",
      important: psa.sticky ?? false,
      onClose: () => {
        setMemory(psa._id);
      },
    });
  });
}

authEvent.subscribe((event) => {
  if (event.type === "authStateChanged") {
    void show();
  }
});
