"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDayMark, submitAttendanceEdit, submitDayMark, submitMovement } from "@/app/actions/attendance";
import { formatMessage } from "@/lib/text";
import { clockFromIso, localInputFromIso } from "@/lib/time";
import { Badge, Empty, ErrorBanner, Field, PageHeader, attendanceLabel, statusTone } from "./ui";

function ResultForm({ dict, action, children, onSaved }) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (!state?.ok) return;
    onSaved?.();
    router.refresh();
  }, [state, onSaved, router]);
  return (
    <form action={formAction} className="form-grid">
      {state?.error ? <p className="form-error span-2" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {children}
      <div className="form-actions span-2">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.common.save}</button>
      </div>
    </form>
  );
}

function revisionClocks(json) {
  try {
    const value = JSON.parse(json);
    const inn = value.check_in ? clockFromIso(value.check_in) : "—";
    const out = value.check_out ? clockFromIso(value.check_out) : "—";
    return `${inn} / ${out}`;
  } catch {
    return "—";
  }
}

export function AttendanceBoard({ dict, rows, employees, marks = [], passages = [], date, nowLocal, canManual, canEdit, error }) {
  const active = employees.filter((employee) => employee.status === "active");
  const [editing, setEditing] = useState(null);
  const [kind, setKind] = useState("holiday");
  const personal = kind === "vacation" || kind === "sick" || kind === "trip" || kind === "excused";
  return (
    <>
      <PageHeader title={dict.attendance.title} subtitle={dict.attendance.subtitle} />
      <ErrorBanner dict={dict} code={error} />
      <form className="filters" method="get" action="/attendance">
        <Field label={dict.common.date} name="date" type="date" defaultValue={date} dict={dict} />
        <button className="btn btn-primary" type="submit">{dict.common.apply}</button>
      </form>
      {canEdit ? (
        <section className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-hd"><div><h2>{dict.attendance.calendar}</h2><p>{dict.attendance.calendarHint}</p></div></div>
          <div className="panel-bd stack">
            <ResultForm dict={dict} action={submitDayMark}>
              <input type="hidden" name="date" value={date} />
              <Field label={dict.attendance.markKind} name="kind" as="select" required dict={dict} value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="holiday">{dict.attendance.statusHoliday}</option>
                <option value="work">{dict.attendance.markWork}</option>
                <option value="vacation">{dict.attendance.statusVacation}</option>
                <option value="sick">{dict.attendance.statusSick}</option>
                <option value="trip">{dict.attendance.statusTrip}</option>
                <option value="excused">{dict.attendance.statusExcused}</option>
              </Field>
              <Field key={personal ? "person" : "org"} label={personal ? dict.attendance.markEmployee : dict.attendance.markAll} name="employee_id" as="select" required={personal} dict={dict} defaultValue={personal ? active[0]?.id || "" : ""}>
                {personal ? active.map((employee) => <option key={employee.id} value={employee.id}>{employee.lastName} {employee.firstName}</option>) : <option value="">{dict.attendance.markAll}</option>}
              </Field>
              <Field wide label={dict.common.note} name="note" dict={dict} />
            </ResultForm>
            {marks.length ? (
              <ul className="stack">
                {marks.map((mark) => {
                  const person = employees.find((employee) => employee.id === mark.employee_id);
                  return (
                    <li key={mark.id} className="form-actions">
                      <span>{mark.kind === "work" ? dict.attendance.markWork : attendanceLabel(dict, mark.kind)} · {person ? `${person.lastName} ${person.firstName}` : dict.attendance.markAll}{mark.note ? ` · ${mark.note}` : ""}</span>
                      <form action={deleteDayMark}>
                        <input type="hidden" name="id" value={mark.id} />
                        <button className="btn btn-ghost" type="submit">{dict.attendance.removeMark}</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}
      {canManual ? (
        <section className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-hd"><h2>{dict.attendance.register}</h2></div>
          <div className="panel-bd">
            {active.length === 0 ? <p className="muted">{dict.attendance.noEmployees}</p> : (
              <ResultForm dict={dict} action={submitMovement}>
                <Field label={dict.attendance.employee} name="employee_id" as="select" required dict={dict} defaultValue={active[0].id}>
                  {active.map((employee) => <option key={employee.id} value={employee.id}>{employee.lastName} {employee.firstName}</option>)}
                </Field>
                <Field label={dict.common.actions} name="direction" as="select" required dict={dict} defaultValue="in">
                  <option value="in">{dict.attendance.directionIn}</option>
                  <option value="out">{dict.attendance.directionOut}</option>
                </Field>
                <Field label={dict.attendance.at} name="at" type="datetime-local" required defaultValue={nowLocal} dict={dict} />
                <Field label={dict.common.note} name="note" dict={dict} />
              </ResultForm>
            )}
          </div>
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-hd"><h2>{formatMessage(dict.employees.shown, { count: rows.length })}</h2></div>
        {rows.length === 0 ? <Empty title={dict.attendance.empty} body={dict.attendance.emptyBody} /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{dict.attendance.employee}</th>
                  <th>{dict.employees.department}</th>
                  <th>{dict.attendance.checkIn}</th>
                  <th>{dict.attendance.checkOut}</th>
                  <th>{dict.attendance.duration}</th>
                  <th>{dict.attendance.late}</th>
                  <th>{dict.attendance.early}</th>
                  <th>{dict.attendance.source}</th>
                  <th>{dict.common.status}</th>
                  {canEdit ? <th>{dict.common.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employee.id}>
                    <td>{row.employee.lastName} {row.employee.firstName}</td>
                    <td>{row.employee.departmentName || "—"}</td>
                    <td className="num">{row.checkInLabel}</td>
                    <td className="num">{row.checkOutLabel}</td>
                    <td className="num">{row.durationLabel}</td>
                    <td className="num">{row.lateMinutes ? `${row.lateMinutes} ${dict.common.minutes}` : "—"}</td>
                    <td className="num">{row.earlyMinutes ? `${row.earlyMinutes} ${dict.common.minutes}` : "—"}</td>
                    <td>{row.source === "camera" ? dict.attendance.sourceCamera : row.source === "manual" ? dict.attendance.sourceManual : "—"}</td>
                    <td><Badge tone={statusTone(row.status)}>{attendanceLabel(dict, row.status)}</Badge></td>
                    {canEdit ? (
                      <td>{row.recordId ? <button className="btn btn-ghost" type="button" onClick={() => setEditing(row)}>{dict.attendance.edit}</button> : "—"}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {passages.length ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-hd"><h2>{dict.attendance.passages}</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{dict.common.time}</th><th>{dict.attendance.employee}</th><th>{dict.common.actions}</th><th>{dict.monitoring.source}</th><th>{dict.common.status}</th></tr></thead>
              <tbody>
                {passages.map((passage) => (
                  <tr key={passage.id}>
                    <td className="num">{clockFromIso(passage.at)}</td>
                    <td>{passage.name}</td>
                    <td>{passage.direction === "out" ? dict.attendance.directionOut : dict.attendance.directionIn}</td>
                    <td>{passage.cameraCode || dict.attendance.sourceManual}</td>
                    <td>{dict.attendance[passage.applied] || passage.applied}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {editing ? (
        <div className="drawer-root">
          <button className="drawer-backdrop" type="button" aria-label={dict.common.close} onClick={() => setEditing(null)} />
          <aside className="drawer" role="dialog" aria-modal="true">
            <header>
              <h2>{dict.attendance.edit}</h2>
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>{dict.common.close}</button>
            </header>
            <ResultForm key={editing.recordId} dict={dict} action={submitAttendanceEdit} onSaved={() => setEditing(null)}>
              <input type="hidden" name="id" value={editing.recordId} />
              <Field label={dict.attendance.checkIn} name="check_in" type="datetime-local" required defaultValue={localInputFromIso(editing.checkIn)} dict={dict} />
              <Field label={dict.attendance.checkOut} name="check_out" type="datetime-local" defaultValue={localInputFromIso(editing.checkOut)} dict={dict} />
              <Field wide label={dict.common.note} name="note" defaultValue={editing.note} dict={dict} />
              <Field wide label={dict.attendance.reason} name="reason" required dict={dict} />
              <p className="muted span-2">{dict.attendance.reasonHint}</p>
            </ResultForm>
            <div className="stack">
              <h3>{dict.attendance.history}</h3>
              {editing.revisions?.length ? (
                <ul className="stack">
                  {editing.revisions.map((item) => (
                    <li key={item.id}>
                      <span className="num">{item.created_at}</span>
                      {" · "}{item.editor_username || "—"}
                      {" · "}{item.reason}
                      {" · "}{revisionClocks(item.before_json)} → {revisionClocks(item.after_json)}
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{dict.attendance.historyEmpty}</p>}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
