import { connection } from "next/server";
import { DepartmentBoard } from "@/components/department-board";
import { listDepartments } from "@/lib/departments";
import { listEmployees } from "@/lib/employees";
import { Denied } from "@/components/ui";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { getLocale } from "@/lib/session";

export const instant = false;

function one(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function DepartmentsPage({ searchParams }) {
  await connection();
  const user = await requireUser();
  const params = await searchParams;
  const departments = listDepartments();
  const selectedId = one(params.id);
  const selected = departments.find((item) => item.id === selectedId) || null;
  const dict = dictionary(await getLocale());
  if (!can(user, "departments.view")) return <Denied dict={dict} />;
  return (
    <DepartmentBoard
      dict={dict}
      departments={departments}
      selected={selected}
      members={selected ? listEmployees({ departmentId: selected.id, status: "all" }) : []}
      canWrite={can(user, "departments.manage")}
      canEditEmployee={can(user, "employees.update")}
      canRemoveEmployee={can(user, "employees.archive")}
      error={one(params.error)}
    />
  );
}
