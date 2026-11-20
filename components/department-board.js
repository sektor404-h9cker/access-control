"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeDepartment, submitDepartment } from "@/app/actions/departments";
import { removeEmployee } from "@/app/actions/employees";
import { formatMessage, fullName } from "@/lib/text";
import { ConfirmButton } from "./confirm-button";
import { Badge, Empty, ErrorBanner, Field, PageHeader } from "./ui";

function DepartmentForm({ dict, department, onSaved }) {
  const [state, action, pending] = useActionState(submitDepartment, null);
  const router = useRouter();
  useEffect(() => {
    if (!state?.ok) return;
    onSaved();
    router.refresh();
  }, [state, onSaved, router]);
  return (
    <form action={action} className="form-grid">
      {department ? <input type="hidden" name="id" value={department.id} /> : null}
      {state?.error && !state.fields ? <p className="form-error span-2" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      <Field wide label={dict.departments.name} name="name" required defaultValue={department?.name} dict={dict} error={state?.fields?.name} />
      <p className="muted span-2">{dict.departments.scheduleHint}</p>
      <Field label={dict.departments.schedule} name="schedule_start" type="time" defaultValue={department?.scheduleStart || ""} dict={dict} error={state?.fields?.schedule_start} />
      <Field label={dict.settings.end} name="schedule_end" type="time" defaultValue={department?.scheduleEnd || ""} dict={dict} />
      <Field label={dict.employees.grace} name="grace_minutes" inputMode="numeric" defaultValue={department?.graceMinutes ?? ""} dict={dict} />
      <div className="form-actions span-2">
        <button className="btn btn-primary" disabled={pending} type="submit">{pending ? dict.common.loading : dict.common.save}</button>
      </div>
    </form>
  );
}

export function DepartmentBoard({ dict, departments, selected, members, canWrite, canEditEmployee, canRemoveEmployee, error }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <PageHeader title={dict.departments.title} subtitle={dict.departments.subtitle}>
        {canWrite ? <button className="btn btn-primary" type="button" onClick={() => { setEditing(null); setOpen(true); }}>{dict.departments.add}</button> : null}
      </PageHeader>
      <ErrorBanner dict={dict} code={error} />
      <section className="panel">
        <div className="panel-hd"><h2>{formatMessage(dict.departments.shown, { count: departments.length })}</h2></div>
        {departments.length === 0 ? <Empty title={dict.departments.empty} body={dict.departments.emptyBody} /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{dict.departments.name}</th>
                  <th>{dict.dashboard.headcount}</th>
                  <th>{dict.departments.schedule}</th>
                  <th>{dict.common.status}</th>
                  {canWrite ? <th>{dict.common.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => (
                  <tr key={department.id}>
                    <td><a href={`/departments?id=${department.id}`}>{department.name}</a></td>
                    <td className="num">{department.headcount}</td>
                    <td>{department.scheduleStart ? `${department.scheduleStart}–${department.scheduleEnd}` : dict.common.inherited}</td>
                    <td><Badge tone={department.archived ? "muted" : "ok"}>{department.archived ? dict.common.archived : dict.common.active}</Badge></td>
                    {canWrite ? (
                      <td>
                        <div className="form-actions">
                          <button className="btn btn-ghost" type="button" onClick={() => { setEditing(department); setOpen(true); }}>{dict.common.edit}</button>
                          <ConfirmButton action={removeDepartment} fields={{ id: department.id }} label={dict.departments.remove} title={dict.departments.removeTitle} body={dict.departments.removeBody} confirmLabel={dict.departments.remove} cancelLabel={dict.common.cancel} disabled={department.headcount > 0} />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-hd">
          <div>
            <h2>{dict.departments.employees}</h2>
            <p>{selected ? selected.name : dict.departments.noneSelected}</p>
          </div>
        </div>
        {!selected ? <Empty title={dict.departments.noneSelected} /> : members.length === 0 ? <Empty title={dict.employees.empty} /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{dict.reports.colEmployee}</th><th>{dict.employees.position}</th><th>{dict.common.status}</th>{canEditEmployee || canRemoveEmployee ? <th>{dict.common.actions}</th> : null}</tr></thead>
              <tbody>
                {members.map((employee) => (
                  <tr key={employee.id}>
                    <td>{fullName(employee)}</td>
                    <td>{employee.position || "—"}</td>
                    <td>{employee.status === "active" ? dict.common.active : dict.common.archived}</td>
                    {canEditEmployee || canRemoveEmployee ? (
                      <td>
                        <div className="form-actions">
                          {canEditEmployee ? <Link className="btn btn-ghost" href={`/employees/${employee.id}`}>{dict.common.edit}</Link> : null}
                          {canRemoveEmployee ? (
                            <ConfirmButton action={removeEmployee} fields={{ id: employee.id }} label={dict.employees.remove} title={dict.employees.removeTitle} body={dict.employees.removeBody} confirmLabel={dict.employees.remove} cancelLabel={dict.common.cancel} />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open ? (
        <div className="drawer-root">
          <button className="drawer-backdrop" type="button" aria-label={dict.common.close} onClick={() => setOpen(false)} />
          <aside className="drawer" role="dialog" aria-modal="true">
            <header>
              <h2>{editing ? dict.departments.edit : dict.departments.add}</h2>
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>{dict.common.close}</button>
            </header>
            <DepartmentForm key={editing?.id || "new"} dict={dict} department={editing} onSaved={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
