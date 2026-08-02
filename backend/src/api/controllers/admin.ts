import { CrocoResponse } from "../../utils/croco-response";
import { buildCrocoMail } from "../../utils/croco-mail";
import * as UserDAL from "../../dal/user";
import * as ReportDAL from "../../dal/report";
import {
  AcceptReportsRequest,
  RejectReportsRequest,
  ToggleBanRequest,
  ToggleBanResponse,
} from "@croco-calc/contracts/admin";
import CrocoError, { getErrorMessage } from "../../utils/error";
import { Configuration } from "@croco-calc/schemas/configuration";
import { addImportantLog } from "../../dal/logs";
import { CrocoRequest } from "../types";

export async function test(_req: CrocoRequest): Promise<CrocoResponse> {
  return new CrocoResponse("OK", null);
}

export async function toggleBan(
  req: CrocoRequest<undefined, ToggleBanRequest>,
): Promise<ToggleBanResponse> {
  const { uid } = req.body;

  const user = await UserDAL.getPartialUser(uid, "toggle ban", ["banned"]);

  await UserDAL.setBanned(uid, !user.banned);

  void addImportantLog("user_ban_toggled", { banned: !user.banned }, uid);

  return new CrocoResponse(`Ban toggled`, {
    banned: !user.banned,
  });
}

export async function acceptReports(
  req: CrocoRequest<undefined, AcceptReportsRequest>,
): Promise<CrocoResponse> {
  await handleReports(
    req.body.reports.map((it) => ({ ...it })),
    true,
    req.ctx.configuration.users.inbox,
  );
  return new CrocoResponse("Reports removed and users notified.", null);
}

export async function rejectReports(
  req: CrocoRequest<undefined, RejectReportsRequest>,
): Promise<CrocoResponse> {
  await handleReports(
    req.body.reports.map((it) => ({ ...it })),
    false,
    req.ctx.configuration.users.inbox,
  );
  return new CrocoResponse("Reports removed and users notified.", null);
}

export async function handleReports(
  reports: { reportId: string; reason?: string }[],
  accept: boolean,
  inboxConfig: Configuration["users"]["inbox"],
): Promise<void> {
  const reportIds = reports.map(({ reportId }) => reportId);

  const reportsFromDb = await ReportDAL.getReports(reportIds);
  const reportById = new Map(reportsFromDb.map((it) => [it.id, it]));

  const existingReportIds = new Set(reportsFromDb.map((report) => report.id));
  const missingReportIds = reportIds.filter(
    (reportId) => !existingReportIds.has(reportId),
  );

  if (missingReportIds.length > 0) {
    throw new CrocoError(
      404,
      `Reports not found for some IDs ${missingReportIds.join(",")}`,
    );
  }

  await ReportDAL.deleteReports(reportIds);

  for (const { reportId, reason } of reports) {
    try {
      const report = reportById.get(reportId);
      if (!report) {
        throw new CrocoError(404, `Report not found for ID: ${reportId}`);
      }

      let mailBody = "";
      if (accept) {
        mailBody = `Your report regarding ${report.type} ${
          report.contentId
        } (${report.reason.toLowerCase()}) has been approved. Thank you.`;
      } else {
        mailBody = `Sorry, but your report regarding ${report.type} ${
          report.contentId
        } (${report.reason.toLowerCase()}) has been denied. ${
          reason !== undefined ? `\nReason: ${reason}` : ""
        }`;
      }

      const mailSubject = accept ? "Report approved" : "Report denied";
      const mail = buildCrocoMail({
        subject: mailSubject,
        body: mailBody,
      });
      await UserDAL.addToInbox(report.uid, [mail], inboxConfig);
    } catch (e) {
      if (e instanceof CrocoError) {
        throw new CrocoError(e.status, e.message);
      } else {
        throw new CrocoError(
          500,
          `Error handling reports: ${getErrorMessage(e)}`,
        );
      }
    }
  }
}
