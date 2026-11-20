"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeEmployee, revokeBiometric, submitEnrollment, submitWorkPolicy } from "@/app/actions/employees";
import { formatDateTime } from "@/lib/time";
import { fullName } from "@/lib/text";
import { ConfirmButton } from "./confirm-button";
import { EmployeeForm } from "./employee-board";
import { FaceCapture } from "./face-capture";
import { PhonePair } from "./phone-pair";
import { fillEnrollmentForm } from "./face-vision";
import { Badge, PageHeader } from "./ui";

function PolicyForm({ dict, employeeId, policy, today }) {
  const [state, action, pending] = useActionState(submitWorkPolicy, null);
  const [lead, setLead] = useState(Boolean(policy.leadership));
  return (
    <form action={action} className="stack">
      <p className="muted">{dict.employees.leadershipHint}</p>
      {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note">{dict.common.saved}</p> : null}
      <input type="hidden" name="id" value={employeeId} />
      <label className="check">
        <input type="checkbox" name="leadership" value="1" checked={lead} onChange={(event) => setLead(event.target.checked)} />
        <span>{dict.employees.leadership}</span>
      </label>
      <label className="check">
        <input type="checkbox" name="flex_time" value="1" defaultChecked={policy.flexTime} disabled={!lead} />
        <span>{dict.employees.flex}</span>
      </label>
      <p className="muted">{dict.employees.flexHint}</p>
      <label className="field">
        <span>{dict.employees.policyFrom}</span>
        <input type="date" name="effective_from" required defaultValue={today} min="2024-01-01" max="2035-12-31" />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.common.save}</button>
    </form>
  );
}

export function EmployeeDetail({ dict, locale, employee, departments, schedule, history, sessions, canUpdate, canEnroll, canDelete, canPolicy, policy, attendance, today, sensitive }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [enrollState, enrollAction, enrollPending] = useActionState(submitEnrollment, null);
  const [acknowledged, setAcknowledged] = useState(null);
  const tokenRef = useRef("");
  const name = fullName(employee);
  if (enrollState?.ok && acknowledged !== enrollState) {
    setAcknowledged(enrollState);
    setCameraOpen(false);
  }

  function confirmCapture(result) {
    if (result.mode !== "scan" && result.mode !== "still") return;
    if (!tokenRef.current) tokenRef.current = crypto.randomUUID();
    const data = new FormData();
    data.set("employee_id", employee.id);
    data.set("client_token", tokenRef.current);
    fillEnrollmentForm(data, result);
    startTransition(() => enrollAction(data));
  }

  useEffect(() => {
    if (!enrollState?.ok || acknowledged !== enrollState) return;
    tokenRef.current = "";
    router.refresh();
  }, [acknowledged, enrollState, router]);

  return (
    <>
      <PageHeader title={name} subtitle={dict.face.detail}>
        <Link className="btn btn-ghost" href="/employees">{dict.face.back}</Link>
        {canUpdate ? <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>{dict.common.edit}</button> : null}
        {canEnroll && employee.biometricAllowed ? <button className="btn btn-primary" type="button" onClick={() => setCameraOpen(true)}>{employee.faceEnrolled ? dict.face.rescan : dict.face.register}</button> : null}
        {canEnroll && employee.faceEnrolled ? (
          <ConfirmButton action={revokeBiometric} fields={{ id: employee.id }} label={dict.face.revoke} title={dict.face.revokeTitle} body={dict.face.revokeBody} confirmLabel={dict.face.revoke} cancelLabel={dict.common.cancel} />
        ) : null}
        {canDelete ? (
          <ConfirmButton action={removeEmployee} fields={{ id: employee.id }} label={dict.employees.remove} title={dict.employees.removeTitle} body={dict.employees.removeBody} confirmLabel={dict.employees.remove} cancelLabel={dict.common.cancel} />
        ) : null}
      </PageHeader>
      {enrollState?.error ? <p className="banner" role="alert">{dict.errors[enrollState.error] || dict.errors.generic}</p> : null}
      {canEnroll && employee.biometricAllowed ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <PhonePair dict={dict} employeeId={employee.id} />
        </section>
      ) : null}
      <section className="panel">
        <div className="profile">
          {employee.photoUrl ? (
            // Authenticated private photograph.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="profile-photo" src={employee.photoUrl} alt="" />
          ) : <span className="profile-photo avatar-fallback">{`${employee.lastName?.[0] || ""}${employee.firstName?.[0] || ""}`}</span>}
          <dl className="kv">
            <div><dt>{dict.reports.colEmployee}</dt><dd>{name}</dd></div>
            <div><dt>{dict.employees.department}</dt><dd>{employee.departmentName || "—"}</dd></div>
            <div><dt>{dict.employees.position}</dt><dd>{employee.position || "—"}</dd></div>
            <div><dt>{dict.employees.phone}</dt><dd>{employee.phone || "—"}</dd></div>
            <div><dt>{dict.employees.schedule}</dt><dd>{schedule.start}–{schedule.end}{schedule.grace ? ` +${schedule.grace}` : ""}</dd></div>
            <div><dt>{dict.employees.leadership}</dt><dd>{policy?.leadership ? dict.employees.leadershipOn : "—"}{policy?.flexTime ? ` · ${dict.employees.flexOn}` : ""}{policy?.effectiveFrom ? ` · ${policy.effectiveFrom}` : ""}</dd></div>
            <div><dt>{dict.common.status}</dt><dd><Badge tone={employee.status === "active" ? "ok" : "muted"}>{employee.status === "active" ? dict.common.active : dict.common.archived}</Badge></dd></div>
            {sensitive ? (
              <div>
                <dt>{dict.face.blockTitle}</dt>
                <dd>{employee.faceCurrent ? dict.face.statusEnrolled : employee.faceEnrolled ? dict.face.statusStale : employee.faceStatus === "captured" ? dict.face.statusCaptured : dict.face.statusNone}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        {sensitive && employee.faceCurrent ? <p className="muted profile-note">{dict.face.statusNote}</p> : null}
        {sensitive && !employee.biometricAllowed ? <p className="muted profile-note">{dict.face.needConsent}</p> : null}
      </section>
      {attendance ? (
        <section className="panel">
          <div className="panel-hd"><h2>{dict.employees.attendanceTitle}</h2></div>
          {attendance.days.length === 0 && attendance.passages.length === 0 ? <p className="empty">{dict.employees.attendanceEmpty}</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{dict.reports.colDate}</th>
                    <th>{dict.attendance.checkIn}</th>
                    <th>{dict.attendance.checkOut}</th>
                    <th>{dict.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.days.map((day) => (
                    <tr key={day.id}>
                      <td className="num">{day.workDate}</td>
                      <td className="num">{day.checkIn ? formatDateTime(day.checkIn, locale) : "—"}</td>
                      <td className="num">{day.checkOut ? formatDateTime(day.checkOut, locale) : day.exitMissing ? dict.reports.exitMissing : "—"}</td>
                      <td>{day.source || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {attendance.passages.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{dict.common.time}</th><th>{dict.attendance.directionIn}</th><th>{dict.dashboard.cameras}</th><th>{dict.attendance.source}</th></tr></thead>
                <tbody>
                  {attendance.passages.map((item) => (
                    <tr key={item.id}>
                      <td className="num">{formatDateTime(item.at, locale)}</td>
                      <td>{item.direction === "out" ? dict.attendance.directionOut : dict.attendance.directionIn}</td>
                      <td>{item.cameraCode || "—"}</td>
                      <td>{item.source || item.applied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {attendance.revisions.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{dict.common.time}</th><th>{dict.common.username}</th><th>{dict.employees.attendanceCorrection}</th></tr></thead>
                <tbody>
                  {attendance.revisions.map((item) => (
                    <tr key={item.id}>
                      <td className="num">{formatDateTime(item.at, locale)}</td>
                      <td>{item.editor || "—"}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
      {canPolicy ? (
        <section className="panel">
          <div className="panel-hd"><h2>{dict.employees.leadership}</h2></div>
          <div className="panel-bd"><PolicyForm key={`${policy?.leadership}-${policy?.flexTime}-${policy?.effectiveFrom}`} dict={dict} employeeId={employee.id} policy={policy || { leadership: false, flexTime: false }} today={today} /></div>
        </section>
      ) : null}
      {sensitive ? (
        <section className="panel">
          <div className="panel-hd"><h2>{dict.face.sessions}</h2></div>
          {sessions.length === 0 ? <p className="empty">{dict.face.sessionsEmpty}</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{dict.common.time}</th><th>{dict.common.actions}</th><th>{dict.face.blockTitle}</th></tr></thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td className="num">{formatDateTime(session.createdAt, locale)}</td>
                      <td>{session.mode === "scan" ? dict.face.scan : dict.face.shutter}</td>
                      <td>{dict.face.frameSaved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {sensitive ? (
        <section className="panel">
          <div className="panel-hd"><h2>{dict.face.history}</h2></div>
          {history.length === 0 ? <p className="empty">{dict.face.historyEmpty}</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{dict.common.time}</th><th>{dict.common.username}</th><th>{dict.common.actions}</th></tr></thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td className="num">{formatDateTime(entry.created_at, locale)}</td>
                      <td>{entry.username || "—"}</td>
                      <td>{dict.audit[entry.action] || entry.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {editing ? (
        <div className="drawer-root">
          <button className="drawer-backdrop" type="button" aria-label={dict.common.close} onClick={() => setEditing(false)} />
          <aside className="drawer" role="dialog" aria-modal="true">
            <header>
              <h2>{dict.employees.edit}</h2>
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>{dict.common.close}</button>
            </header>
            <EmployeeForm dict={dict} departments={departments} employee={employee} consent={canUpdate} onSaved={() => { setEditing(false); router.refresh(); }} />
          </aside>
        </div>
      ) : null}
      {cameraOpen ? (
        <FaceCapture
          dict={dict}
          busy={enrollPending}
          serverError={enrollState?.error ? (dict.errors[enrollState.error] || dict.errors.generic) : ""}
          onClose={() => setCameraOpen(false)}
          replace={employee.faceEnrolled}
          onConfirm={confirmCapture}
        />
      ) : null}
    </>
  );
}
