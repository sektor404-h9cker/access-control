import { connection } from "next/server";
import { notFound } from "next/navigation";
import { EmployeeDetail } from "@/components/employee-detail";
import { auditForEntity } from "@/lib/audit";
import { listDepartments } from "@/lib/departments";
import { listFaceSessions } from "@/lib/enrollment";
import { getEmployeeRow, mapEmployee, presentEmployee } from "@/lib/employees";
import { Denied } from "@/components/ui";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { resolveSchedule } from "@/lib/schedule";
import { getLocale } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { addDays, todayKey } from "@/lib/time";
import { policyFor } from "@/lib/work-policy";
import { listEmployeeAttendance } from "@/lib/passages";

export const instant = false;

export default async function EmployeeDetailPage({ params }) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  const row = getEmployeeRow(id);
  if (!row || row.removed_at) notFound();
  const dict = dictionary(await getLocale());
  if (!can(user, "employees.view")) return <Denied dict={dict} />;
  const sensitive = can(user, "enrollment.manage");
  const today = todayKey();
  return (
    <EmployeeDetail
      dict={dict}
      locale={await getLocale()}
      employee={presentEmployee(mapEmployee(row), sensitive)}
      departments={listDepartments()}
      schedule={resolveSchedule(row, getSettings())}
      history={sensitive ? auditForEntity("employee", id, 20) : []}
      sessions={sensitive ? listFaceSessions(id) : []}
      canUpdate={can(user, "employees.update")}
      canArchive={can(user, "employees.archive")}
      canEnroll={sensitive}
      canDelete={can(user, "employees.archive")}
      canPolicy={can(user, "employees.policy")}
      policy={policyFor(id, today)}
      attendance={can(user, "attendance.view") ? listEmployeeAttendance(id, addDays(today, -30), today) : null}
      today={today}
      sensitive={sensitive}
    />
  );
}
