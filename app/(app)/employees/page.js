import { connection } from "next/server";
import { EmployeeBoard } from "@/components/employee-board";
import { listDepartments } from "@/lib/departments";
import { listEmployees, presentEmployee } from "@/lib/employees";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { getLocale } from "@/lib/session";
import { Denied } from "@/components/ui";

export const instant = false;

function one(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function EmployeesPage({ searchParams }) {
  await connection();
  const user = await requireUser();
  const params = await searchParams;
  const status = one(params.status);
  const filters = {
    q: one(params.q).slice(0, 80),
    departmentId: one(params.department),
    status: status === "archived" || status === "all" ? status : "active",
  };
  const dict = dictionary(await getLocale());
  if (!can(user, "employees.view")) return <Denied dict={dict} />;
  const sensitive = can(user, "enrollment.manage");
  return (
    <EmployeeBoard
      dict={dict}
      employees={listEmployees(filters).map((employee) => presentEmployee(employee, sensitive))}
      departments={listDepartments()}
      filters={filters}
      access={{
        create: can(user, "employees.create"),
        update: can(user, "employees.update"),
        archive: can(user, "employees.archive"),
        enroll: sensitive,
      }}
      error={one(params.error)}
    />
  );
}
