import { connection } from "next/server";
import { listDepartments } from "@/lib/departments";
import { listEmployees } from "@/lib/employees";
import { dictionary } from "@/lib/i18n";
import { buildReport, presentReport } from "@/lib/reports/build";
import { getLocale } from "@/lib/session";
import { formatDateKey, resolvePeriod, todayKey } from "@/lib/time";
import { Denied, Empty, ErrorBanner, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/permissions";

export const instant = false;

function one(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function ReportsPage({ searchParams }) {
  await connection();
  const user = await requireUser();
  const params = await searchParams;
  const locale = await getLocale();
  const dict = dictionary(locale);
  if (!can(user, "reports.view")) return <Denied dict={dict} />;
  const canExport = can(user, "reports.export");
  const period = one(params.period) || "today";
  const range = resolvePeriod({ period, from: one(params.from), to: one(params.to) }, todayKey());
  const employeeId = one(params.employee);
  const departmentId = one(params.department);
  const employees = listEmployees({ status: "all" });
  const departments = listDepartments();
  const report = range.error ? null : presentReport(buildReport({
    from: range.from,
    to: range.to,
    employeeId,
    departmentId,
    dict,
    periodLabel: `${dict.reports.period}: ${formatDateKey(range.from)} — ${formatDateKey(range.to)}`,
  }), dict, locale);
  const query = new URLSearchParams({
    period,
    from: range.from || one(params.from),
    to: range.to || one(params.to),
    employee: employeeId,
    department: departmentId,
  });
  return (
    <>
      <PageHeader title={dict.reports.title} subtitle={dict.reports.subtitle}>
        {report && canExport ? (
          <>
            <a className="btn btn-ghost" href={`/api/reports/export?${query}&format=pdf`}>{dict.reports.pdf}</a>
            <a className="btn btn-ghost" href={`/api/reports/export?${query}&format=xlsx`}>{dict.reports.excel}</a>
          </>
        ) : null}
      </PageHeader>
      <ErrorBanner dict={dict} code={range.error} />
      <form className="filters" method="get" action="/reports">
        <label className="field">
          <span>{dict.reports.period}</span>
          <select name="period" defaultValue={period}>
            <option value="today">{dict.reports.today}</option>
            <option value="yesterday">{dict.reports.yesterday}</option>
            <option value="week">{dict.reports.week}</option>
            <option value="month">{dict.reports.month}</option>
            <option value="custom">{dict.reports.custom}</option>
          </select>
        </label>
        <label className="field">
          <span>{dict.common.dateFrom}</span>
          <input name="from" type="date" defaultValue={one(params.from)} />
        </label>
        <label className="field">
          <span>{dict.common.dateTo}</span>
          <input name="to" type="date" defaultValue={one(params.to)} />
        </label>
        <label className="field">
          <span>{dict.attendance.employee}</span>
          <select name="employee" defaultValue={employeeId}>
            <option value="">{dict.reports.allEmployees}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.lastName} {employee.firstName}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{dict.employees.department}</span>
          <select name="department" defaultValue={departmentId}>
            <option value="">{dict.reports.allDepartments}</option>
            <option value="__none__">{dict.reports.unassigned}</option>
            {departments.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">{dict.common.apply}</button>
      </form>
      {report ? (
        <>
          <section className="stats">
            {[
              [dict.reports.summaryEmployees, report.summary.employees],
              [dict.reports.summaryPresent, report.summary.present],
              [dict.reports.summaryAbsent, report.summary.absent],
              [dict.reports.summaryLate, report.summary.late],
              [dict.reports.summaryEarly, report.summary.early],
            ].map(([label, value]) => (
              <article key={label} className="stat"><span>{label}</span><b>{value}</b></article>
            ))}
          </section>
          <section className="panel">
            <div className="panel-hd"><div><h2>{report.periodLabel}</h2><p>{report.generatedAtLabel}</p></div></div>
            {report.rows.length === 0 ? <Empty title={dict.reports.empty} /> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr>{report.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((row, index) => (
                      <tr key={`${row.employeeId}-${row.sortDate}-${index}`}>
                        {report.columns.map((column) => <td key={column.key} className={column.key === "employee" || column.key === "department" || column.key === "status" ? undefined : "num"}>{row[column.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel-bd"><p className="muted">{dict.reports.weekendNote}</p></div>
          </section>
        </>
      ) : null}
    </>
  );
}
