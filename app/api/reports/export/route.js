import { connection } from "next/server";
import { dictionary } from "@/lib/i18n";
import { buildReport, presentReport } from "@/lib/reports/build";
import { buildPdf } from "@/lib/reports/pdf";
import { buildXlsx } from "@/lib/reports/xlsx";
import { can } from "@/lib/permissions";
import { getCurrentUser, getLocale } from "@/lib/session";
import { formatDateKey, resolvePeriod, todayKey } from "@/lib/time";

export async function GET(request) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "reports.export")) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const locale = await getLocale();
  const dict = dictionary(locale);
  const range = resolvePeriod({
    period: url.searchParams.get("period") || "today",
    from: url.searchParams.get("from") || "",
    to: url.searchParams.get("to") || "",
  }, todayKey());
  if (range.error) return new Response("Bad request", { status: 400 });
  const report = presentReport(buildReport({
    from: range.from,
    to: range.to,
    employeeId: url.searchParams.get("employee") || "",
    departmentId: url.searchParams.get("department") || "",
    dict,
    periodLabel: `${dict.reports.period}: ${formatDateKey(range.from)} — ${formatDateKey(range.to)}`,
  }), dict, locale);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  const body = format === "xlsx" ? buildXlsx(report) : await buildPdf(report, locale);
  const filename = `SMZ-attendance-${range.from}-${range.to}.${format === "xlsx" ? "xlsx" : "pdf"}`;
  return new Response(body, {
    headers: {
      "Content-Type": format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
