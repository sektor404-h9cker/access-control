import { connection } from "next/server";
import { AttendanceBoard } from "@/components/attendance-board";
import { LivePulse } from "@/components/live-pulse";
import { Denied } from "@/components/ui";
import { dailyBoard } from "@/lib/attendance";
import { listPassages } from "@/lib/passages";
import { marksOn } from "@/lib/calendar";
import { listEmployees, presentEmployee } from "@/lib/employees";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { getLocale } from "@/lib/session";
import { bakuStamp, isDateKey, todayKey } from "@/lib/time";

export const instant = false;

function one(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function AttendancePage({ searchParams }) {
  await connection();
  const user = await requireUser();
  const params = await searchParams;
  const requested = one(params.date);
  const date = isDateKey(requested) ? requested : todayKey();
  const dict = dictionary(await getLocale());
  if (!can(user, "attendance.view")) return <Denied dict={dict} />;
  return (
    <>
    <LivePulse />
    <AttendanceBoard
      dict={dict}
      rows={dailyBoard(date).map((row) => ({
        ...row,
        employee: presentEmployee(row.employee, can(user, "enrollment.manage")),
      }))}
      passages={listPassages(date)}
      employees={listEmployees({ status: "all" }).map((employee) => presentEmployee(employee, can(user, "enrollment.manage")))}
      marks={marksOn(date)}
      date={date}
      nowLocal={bakuStamp().iso.slice(0, 16)}
      canManual={can(user, "attendance.manual")}
      canEdit={can(user, "attendance.edit")}
      error={one(params.error)}
    />
    </>
  );
}
