"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveEmployee, removeEmployee, restoreEmployee, submitEmployee, submitEnrollment, submitImport } from "@/app/actions/employees";
import { formatMessage, fullName } from "@/lib/text";
import { ConfirmButton } from "./confirm-button";
import { FaceCapture } from "./face-capture";
import { fillEnrollmentForm } from "./face-vision";
import { Badge, Empty, ErrorBanner, Field, PageHeader } from "./ui";

function initials(employee) {
  return `${employee.lastName?.[0] || ""}${employee.firstName?.[0] || ""}`.toLocaleUpperCase("az");
}

function scheduleLabel(employee, dict) {
  if (!employee.scheduleStart && !employee.scheduleEnd && employee.graceMinutes == null) return dict.common.inherited;
  const grace = employee.graceMinutes == null ? "" : ` +${employee.graceMinutes}`;
  return `${employee.scheduleStart || "·"}–${employee.scheduleEnd || "·"}${grace}`;
}

export function EmployeeForm({ dict, departments, employee, onSaved, consent = false }) {
  const [state, action, pending] = useActionState(submitEmployee, null);
  const [enrollState, enrollAction, enrollPending] = useActionState(submitEnrollment, null);
  const router = useRouter();
  const photoRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [shotUrl, setShotUrl] = useState("");
  const tokenRef = useRef("");
  useEffect(() => {
    if (!state?.ok && !enrollState?.ok) return;
    onSaved();
    router.refresh();
  }, [state, enrollState, onSaved, router]);

  function attachPhoto(blob) {
    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    if (photoRef.current) photoRef.current.files = transfer.files;
    setShotUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(blob);
    });
  }

  function confirmCapture(result) {
    if (!employee?.id) {
      attachPhoto(result.blob);
      setCameraOpen(false);
      return;
    }
    if (!tokenRef.current) tokenRef.current = crypto.randomUUID();
    const data = new FormData();
    data.set("employee_id", employee.id);
    data.set("client_token", tokenRef.current);
    fillEnrollmentForm(data, result);
    startTransition(() => enrollAction(data));
  }
  const options = departments.filter((item) => !item.archived || item.id === employee?.departmentId);
  return (
    <form action={action} className="form-grid">
      {employee ? <input type="hidden" name="id" value={employee.id} /> : null}
      {state?.error && !state.fields ? <p className="form-error span-2" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      <Field label={dict.employees.lastName} name="last_name" required defaultValue={employee?.lastName} dict={dict} error={state?.fields?.last_name} />
      <Field label={dict.employees.firstName} name="first_name" required defaultValue={employee?.firstName} dict={dict} error={state?.fields?.first_name} />
      <Field label={dict.employees.patronymic} name="patronymic" defaultValue={employee?.patronymic} dict={dict} error={state?.fields?.patronymic} />
      <Field label={dict.employees.department} name="department_id" as="select" defaultValue={employee?.departmentId || ""} dict={dict} error={state?.fields?.department_id}>
        <option value="">{dict.common.notSet}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>{item.name}{item.archived ? ` (${dict.common.archived})` : ""}</option>
        ))}
      </Field>
      <Field label={dict.employees.position} name="position" defaultValue={employee?.position} dict={dict} error={state?.fields?.position} />
      <Field wide label={dict.employees.phone} name="phone" defaultValue={employee?.phone} dict={dict} error={state?.fields?.phone} />
      {consent ? (
        <label className="check span-2">
          <input type="hidden" name="biometric_present" value="1" />
          <input type="checkbox" name="biometric_allowed" value="1" defaultChecked={Boolean(employee?.biometricAllowed)} />
          <span>{dict.face.biometric}</span>
        </label>
      ) : null}
      <Field wide ref={photoRef} label={dict.employees.photo} name="photo" type="file" accept="image/jpeg,image/png,image/webp" dict={dict} error={state?.fields?.photo} />
      <div className="span-2 stack">
        <strong>{dict.face.blockTitle}</strong>
        <p className="muted">{dict.face.blockHint}</p>
        <div className="form-actions">
          <button className="btn btn-primary" type="button" onClick={() => setCameraOpen(true)}>{dict.face.openCamera}</button>
          <button className="btn btn-ghost" type="button" onClick={() => photoRef.current?.click()}>{dict.face.upload}</button>
        </div>
        {employee?.id ? null : <p className="muted">{dict.face.scanNeedsCard}</p>}
        {shotUrl ? (
          // Preview of a photograph captured in this browser before it is saved.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="shot-preview" src={shotUrl} alt={dict.face.preview} />
        ) : null}
        {enrollState?.error ? <p className="form-error" role="alert">{dict.errors[enrollState.error] || dict.errors.generic}</p> : null}
      </div>
      <p className="muted span-2">{dict.employees.photoHint}</p>
      {employee?.photoUrl ? (
        <label className="check span-2">
          <input type="checkbox" name="remove_photo" value="1" />
          {dict.employees.removePhoto}
        </label>
      ) : null}
      <p className="muted span-2">{dict.employees.scheduleHint}</p>
      <Field label={dict.employees.schedule} name="schedule_start" type="time" defaultValue={employee?.scheduleStart || ""} dict={dict} error={state?.fields?.schedule_start} />
      <Field label={dict.settings.end} name="schedule_end" type="time" defaultValue={employee?.scheduleEnd || ""} dict={dict} />
      <Field label={dict.employees.grace} name="grace_minutes" inputMode="numeric" defaultValue={employee?.graceMinutes ?? ""} dict={dict} error={state?.fields?.grace_minutes} />
      <div className="form-actions span-2">
        <button className="btn btn-primary" type="submit" disabled={pending || enrollPending}>{pending ? dict.common.loading : dict.common.save}</button>
      </div>
      {cameraOpen ? (
        <FaceCapture
          dict={dict}
          busy={enrollPending}
          serverError={enrollState?.error ? (dict.errors[enrollState.error] || dict.errors.generic) : ""}
          onClose={() => setCameraOpen(false)}
          onConfirm={confirmCapture}
        />
      ) : null}
    </form>
  );
}

export function EmployeeBoard({ dict, employees, departments, filters, access = {}, error }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canCreate = Boolean(access.create);
  const canUpdate = Boolean(access.update);
  const canArchive = Boolean(access.archive);
  const showActions = canUpdate || canArchive;
  const filtered = Boolean(filters.q || filters.departmentId || filters.status !== "active");
  const [importState, importAction, importPending] = useActionState(submitImport, null);
  return (
    <>
      <PageHeader title={dict.employees.title} subtitle={dict.employees.subtitle}>
        <a className="btn btn-ghost" href="/api/employees/export">{dict.employees.exportCsv}</a>
        {canCreate ? <button className="btn btn-primary" type="button" onClick={() => { setEditing(null); setOpen(true); }}>{dict.employees.add}</button> : null}
      </PageHeader>
      <ErrorBanner dict={dict} code={error} />
      <form className="filters" method="get" action="/employees">
        <Field label={dict.common.search} name="q" defaultValue={filters.q} placeholder={dict.employees.searchPlaceholder} dict={dict} />
        <Field label={dict.employees.department} name="department" as="select" defaultValue={filters.departmentId} dict={dict}>
          <option value="">{dict.common.all}</option>
          <option value="__none__">{dict.dashboard.noDepartment}</option>
          {departments.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Field>
        <Field label={dict.common.status} name="status" as="select" defaultValue={filters.status} dict={dict}>
          <option value="active">{dict.common.active}</option>
          <option value="archived">{dict.common.archived}</option>
          <option value="all">{dict.common.all}</option>
        </Field>
        <button className="btn btn-primary" type="submit">{dict.common.apply}</button>
        <Link className="btn btn-ghost" href="/employees">{dict.common.reset}</Link>
      </form>
      {canCreate || canUpdate ? (
        <form action={importAction} className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-bd stack">
            <p className="muted">{dict.employees.importHint}</p>
            {importState?.error ? <p className="form-error" role="alert">{dict.errors[importState.error] || dict.errors.generic}</p> : null}
            {importState?.ok ? <p className="ok-note">{formatMessage(dict.employees.importDone, importState)}</p> : null}
            <div className="form-actions">
              <input name="file" type="file" accept=".csv,text/csv" required />
              <button className="btn btn-ghost" type="submit" disabled={importPending}>{importPending ? dict.common.loading : dict.employees.importCsv}</button>
            </div>
          </div>
        </form>
      ) : null}
      <section className="panel">
        <div className="panel-hd"><h2>{formatMessage(dict.employees.shown, { count: employees.length })}</h2></div>
        {employees.length === 0 ? (
          <Empty title={filtered ? dict.employees.emptyFiltered : dict.employees.empty} body={filtered ? null : dict.employees.emptyBody} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{dict.reports.colEmployee}</th>
                  <th>{dict.employees.department}</th>
                  <th>{dict.employees.position}</th>
                  <th>{dict.employees.phone}</th>
                  <th>{dict.employees.schedule}</th>
                  <th>{dict.common.status}</th>
                  {showActions ? <th>{dict.common.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <div className="person">
                        {employee.photoUrl ? (
                          // Authenticated private photos are served by our own route, not the image optimizer.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="avatar" src={employee.photoUrl} alt="" />
                        ) : <span className="avatar-fallback">{initials(employee)}</span>}
                        <Link href={`/employees/${employee.id}`}>{fullName(employee)}</Link>
                      </div>
                    </td>
                    <td>{employee.departmentName || "—"}</td>
                    <td>{employee.position || "—"}</td>
                    <td>{employee.phone || "—"}</td>
                    <td>{scheduleLabel(employee, dict)}</td>
                    <td><Badge tone={employee.status === "active" ? "ok" : "muted"}>{employee.status === "active" ? dict.common.active : dict.common.archived}</Badge></td>
                    {showActions ? (
                      <td>
                        <div className="form-actions">
                          {canUpdate ? <button className="btn btn-ghost" type="button" onClick={() => { setEditing(employee); setOpen(true); }}>{dict.common.edit}</button> : null}
                          {canArchive && employee.status === "active" ? (
                            <ConfirmButton
                              action={archiveEmployee}
                              fields={{ id: employee.id }}
                              label={dict.employees.archive}
                              title={dict.employees.archiveTitle}
                              body={dict.employees.archiveBody}
                              confirmLabel={dict.employees.archive}
                              cancelLabel={dict.common.cancel}
                            />
                          ) : null}
                          {canArchive && employee.status !== "active" ? (
                            <ConfirmButton
                              action={restoreEmployee}
                              fields={{ id: employee.id }}
                              label={dict.employees.restore}
                              title={dict.employees.restore}
                              body={dict.employees.archiveBody}
                              confirmLabel={dict.employees.restore}
                              cancelLabel={dict.common.cancel}
                            />
                          ) : null}
                          {canArchive ? (
                            <ConfirmButton
                              action={removeEmployee}
                              fields={{ id: employee.id }}
                              label={dict.employees.remove}
                              title={dict.employees.removeTitle}
                              body={dict.employees.removeBody}
                              confirmLabel={dict.employees.remove}
                              cancelLabel={dict.common.cancel}
                            />
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
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="employee-form-title">
            <header>
              <h2 id="employee-form-title">{editing ? dict.employees.edit : dict.employees.add}</h2>
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>{dict.common.close}</button>
            </header>
            <EmployeeForm key={editing?.id || "new"} dict={dict} departments={departments} employee={editing} consent={canCreate || canUpdate} onSaved={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
