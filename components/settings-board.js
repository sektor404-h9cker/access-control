"use client";

import { useActionState, useState } from "react";
import { deactivateUser, removeRole, restoreUser, submitBackup, submitEndSessions, submitOrganization, submitOwnerClear, submitPurgeDemo, submitRecognitionMode, submitRole, submitRolePermissions, submitUser, submitUserAccount, submitUserPassword } from "@/app/actions/settings";
import { CameraControls } from "./camera-controls";
import { AlertSettings } from "./alert-settings";
import { submitAiSettings } from "@/app/actions/vision";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/time";
import { formatMessage } from "@/lib/text";
import { ConfirmButton } from "./confirm-button";
import { Badge, Empty, ErrorBanner, Field, PageHeader } from "./ui";

function OrgForm({ dict, settings }) {
  const [state, action, pending] = useActionState(submitOrganization, null);
  return (
    <form action={action} className="form-grid">
      {state?.error ? <p className="form-error span-2" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note span-2">{dict.common.saved}</p> : null}
      <Field wide label={dict.settings.enterpriseName} name="enterprise_name" required defaultValue={settings.enterpriseName} dict={dict} error={state?.fields?.enterprise_name} />
      <Field label={dict.settings.start} name="workday_start" type="time" required defaultValue={settings.workdayStart} dict={dict} error={state?.fields?.workday_start} />
      <Field label={dict.settings.end} name="workday_end" type="time" required defaultValue={settings.workdayEnd} dict={dict} error={state?.fields?.workday_end} />
      <Field label={dict.settings.grace} name="grace_minutes" inputMode="numeric" required defaultValue={settings.graceMinutes} dict={dict} error={state?.fields?.grace_minutes} />
      <div className="form-actions span-2">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.common.save}</button>
      </div>
    </form>
  );
}

function BackupForm({ dict }) {
  const [state, action, pending] = useActionState(submitBackup, null);
  return (
    <form action={action}>
      {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note">{formatMessage(dict.settings.backupDone, { folder: state.folder })}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.settings.backupAction}</button>
    </form>
  );
}

function AccountTools({ dict, user, roles, owner }) {
  const [account, accountAction, accountPending] = useActionState(submitUserAccount, null);
  const [password, passwordAction, passwordPending] = useActionState(submitUserPassword, null);
  const choices = roles.filter((role) => owner || role.key !== "owner");
  return (
    <details className="stack">
      <summary>{dict.settings.userManage}</summary>
      <form action={accountAction} className="stack">
        <input type="hidden" name="id" value={user.id} />
        {account?.error && !account.fields ? <p className="form-error" role="alert">{dict.errors[account.error] || dict.errors.generic}</p> : null}
        {account?.ok ? <p className="ok-note">{dict.common.saved}</p> : null}
        <Field label={dict.common.displayName} name="display_name" required defaultValue={user.displayName} dict={dict} error={account?.fields?.display_name} />
        <Field label={dict.common.role} name="role" as="select" required defaultValue={user.role} dict={dict} error={account?.fields?.role}>
          {choices.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
        </Field>
        <button className="btn btn-ghost" type="submit" disabled={accountPending}>{accountPending ? dict.common.loading : dict.common.save}</button>
      </form>
      <form action={passwordAction} className="stack">
        <input type="hidden" name="id" value={user.id} />
        {password?.error && !password.fields ? <p className="form-error" role="alert">{dict.errors[password.error] || dict.errors.generic}</p> : null}
        {password?.ok ? <p className="ok-note">{dict.settings.passwordReset}</p> : null}
        <Field label={dict.common.password} name="password" type="password" required dict={dict} error={password?.fields?.password} autoComplete="new-password" />
        <Field label={dict.common.confirmPassword} name="confirm_password" type="password" required dict={dict} error={password?.fields?.confirm_password} autoComplete="new-password" />
        <button className="btn btn-ghost" type="submit" disabled={passwordPending}>{passwordPending ? dict.common.loading : dict.settings.resetPassword}</button>
      </form>
      <ConfirmButton action={submitEndSessions} fields={{ id: user.id }} label={dict.settings.endSessions} title={dict.settings.endSessions} body={dict.settings.endSessionsBody} confirmLabel={dict.settings.endSessions} cancelLabel={dict.common.cancel} />
    </details>
  );
}

function UserForm({ dict, roles, owner }) {
  const [state, action, pending] = useActionState(submitUser, null);
  return (
    <form action={action} className="form-grid">
      {state?.error && !state.fields ? <p className="form-error span-2" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note span-2">{dict.common.saved}</p> : null}
      <Field label={dict.common.displayName} name="display_name" required dict={dict} error={state?.fields?.display_name} />
      <Field label={dict.common.username} name="username" required dict={dict} error={state?.fields?.username} autoComplete="off" />
      <Field label={dict.common.role} name="role" as="select" required defaultValue={roles.find((role) => role.key === "admin")?.key || roles[0]?.key || ""} dict={dict} error={state?.fields?.role}>
        {roles.filter((role) => owner || role.key !== "owner").map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
      </Field>
      <Field label={dict.common.password} name="password" type="password" required dict={dict} error={state?.fields?.password} autoComplete="new-password" />
      <Field wide label={dict.common.confirmPassword} name="confirm_password" type="password" required dict={dict} error={state?.fields?.confirm_password} autoComplete="new-password" />
      <p className="muted span-2">{dict.auth.passwordHint}</p>
      <div className="form-actions span-2">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.settings.addUser}</button>
      </div>
    </form>
  );
}

function RoleMatrix({ dict, roles }) {
  const [key, setKey] = useState(roles.find((role) => role.key !== "owner")?.key || roles[0]?.key || "");
  const [state, action, pending] = useActionState(submitRolePermissions, null);
  const [created, createAction, creating] = useActionState(submitRole, null);
  const selected = roles.find((role) => role.key === key) || roles[0];
  const groups = [...new Set(PERMISSIONS.map((item) => item.group))];
  if (!selected) return null;
  return (
    <div className="stack">
      <form action={createAction} className="form-grid">
        {created?.error ? <p className="form-error span-2" role="alert">{dict.errors[created.error] || dict.errors.generic}</p> : null}
        {created?.ok ? <p className="ok-note span-2">{dict.common.saved}</p> : null}
        <Field label={dict.access.roleNameRu} name="name_ru" required dict={dict} />
        <Field label={dict.access.roleNameAz} name="name_az" required dict={dict} />
        <div className="form-actions span-2">
          <button className="btn btn-ghost" type="submit" disabled={creating}>{creating ? dict.common.loading : dict.access.createRole}</button>
        </div>
      </form>
      <label className="field">
        <span>{dict.common.role}</span>
        <select value={selected.key} onChange={(event) => setKey(event.target.value)}>
          {roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
        </select>
      </label>
      {selected.description ? <p className="muted">{selected.description}</p> : null}
      {selected.key === "owner" ? <p className="muted">{dict.access.ownerLocked}</p> : null}
      <form key={selected.key} action={action} className="perm-grid">
        <input type="hidden" name="role_key" value={selected.key} />
        {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
        {state?.ok ? <p className="ok-note">{dict.common.saved}</p> : null}
        {groups.map((group) => (
          <fieldset key={group} className="perm-group">
            <legend>{dict.access.groups[group]}</legend>
            {PERMISSIONS.filter((item) => item.group === group).map((item) => (
              <label key={item.key} className="switch">
                <input
                  type="checkbox"
                  name="perm"
                  value={item.key}
                  defaultChecked={selected.permissions.includes(item.key)}
                  disabled={selected.key === "owner"}
                />
                <span>
                  <strong>{dict.access.permissions[item.key]}</strong>
                  <small>{dict.access.descriptions[item.key]}</small>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
        {selected.key === "owner" ? null : (
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.access.saveMatrix}</button>
          </div>
        )}
      </form>
      {selected.builtin ? null : (
        <ConfirmButton
          action={removeRole}
          fields={{ role_key: selected.key }}
          label={dict.access.deleteRole}
          title={dict.access.deleteRoleTitle}
          body={dict.access.deleteRoleBody}
          confirmLabel={dict.access.deleteRole}
          cancelLabel={dict.common.cancel}
        />
      )}
    </div>
  );
}

function RecognitionForm({ dict, settings }) {
  const [state, action, pending] = useActionState(submitRecognitionMode, null);
  return (
    <form action={action} className="stack">
      <p className="muted">{dict.settings.recognitionHint}</p>
      {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note">{dict.common.saved}</p> : null}
      <label className="check"><input type="radio" name="mode" value="diagnostic" defaultChecked={settings.recognitionMode === "diagnostic"} /> <span>{dict.settings.modeDiagnostic}</span></label>
      <label className="check"><input type="radio" name="mode" value="review" defaultChecked={settings.recognitionMode === "review"} /> <span>{dict.settings.modeReview}</span></label>
      <label className="check"><input type="radio" name="mode" value="pilot" defaultChecked={settings.recognitionMode === "pilot"} /> <span>{dict.settings.modePilot}</span></label>
      <label className="check"><input type="radio" name="pace" value="motion" defaultChecked={settings.recognitionPace !== "close"} /> <span>{dict.monitoring.motionMode}</span></label>
      <label className="check"><input type="radio" name="pace" value="close" defaultChecked={settings.recognitionPace === "close"} /> <span>{dict.monitoring.stillMode}</span></label>
      <p className="muted">{dict.monitoring.motionHint}</p>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.common.save}</button>
    </form>
  );
}

const CLEAR_SCOPES = ["logs", "recognition", "passages", "attendance", "calendar", "biometrics", "employees"];

function OwnerClearForm({ dict, overview }) {
  const [state, action, pending] = useActionState(submitOwnerClear, null);
  const counts = overview || {};
  return (
    <form action={action} className="stack">
      <p className="muted">{dict.settings.ownerDataHint}</p>
      <div className="owner-grid">
        {CLEAR_SCOPES.map((scope) => (
          <label className="check" key={scope}>
            <input type="checkbox" name="scope" value={scope} disabled={!counts[scope]} />
            <span>{dict.settings.ownerScopes[scope]} · {counts[scope] || 0}</span>
          </label>
        ))}
      </div>
      {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note">{state.empty ? dict.settings.ownerEmpty : dict.common.saved}</p> : null}
      <Field label={dict.settings.ownerConfirm} name="phrase" dict={dict} />
      <button className="btn btn-danger" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.settings.ownerButton}</button>
    </form>
  );
}

function PurgeForm({ dict, purge }) {
  const [state, action, pending] = useActionState(submitPurgeDemo, null);
  return (
    <form action={action} className="stack">
      <p className="muted">{dict.settings.purgeHint}</p>
      <p>{formatMessage(dict.settings.purgeCount, purge || { total: 0 })}</p>
      {purge?.total ? null : <p className="muted">{dict.settings.purgeEmpty}</p>}
      {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note">{state.empty ? dict.settings.purgeEmpty : dict.common.saved}</p> : null}
      <Field label={dict.settings.purgeConfirm} name="phrase" dict={dict} />
      <button className="btn btn-ghost" type="submit" disabled={pending || !purge?.total}>{pending ? dict.common.loading : dict.settings.purgeButton}</button>
    </form>
  );
}

export function SettingsBoard({ dict, locale, settings, cameras, users, roles = [], access, audit, currentUserId, error, purge = null, overview = null, alert = null, ai = null }) {
  const roleName = (key) => roles.find((role) => role.key === key)?.name || dict.roles[key] || key;
  return (
    <>
      <PageHeader title={dict.settings.title} subtitle={dict.settings.subtitle} />
      <ErrorBanner dict={dict} code={error} />
      <div className="stack">
        {access.orgView ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.enterprise}</h2><p>{dict.settings.enterpriseHint}</p></div></div>
            <div className="panel-bd">{access.org ? <OrgForm dict={dict} settings={settings} /> : <p>{settings.enterpriseName} · {settings.workdayStart}–{settings.workdayEnd}</p>}</div>
          </section>
        ) : null}
        {cameras ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.cameras}</h2><p>{dict.settings.camerasHint}</p></div></div>
            <div className="panel-bd split">
              {cameras.map((camera) => (
                <div key={camera.id} id={`camera-${camera.id}`}>
                  <h2 style={{ marginTop: 0 }}>{camera.code} · {camera.direction === "entrance" ? dict.monitoring.entrance : dict.monitoring.exit}</h2>
                  {access.assign ? (
                    <CameraControls
                      key={`${camera.updatedAt}-${camera.deviceId}-${camera.enabled}-${camera.direction}`}
                      dict={dict}
                      camera={camera}
                      showPreview
                    />
                  ) : <p className="muted">{camera.deviceLabel || camera.host || dict.monitoring.notConfigured}</p>}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {access.assign && alert ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.soundTitle}</h2><p>{dict.settings.soundPlace}</p></div></div>
            <div className="panel-bd"><AlertSettings key={`${alert.tone}:${alert.volume}:${alert.cooldownSeconds}:${alert.enabled}:${alert.voice}`} dict={dict} alert={alert} /></div>
          </section>
        ) : null}
        {access.owner && ai ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.aiTitle}</h2><p>{dict.settings.aiHint}</p></div></div>
            <form action={submitAiSettings} className="panel-bd stack">
              <label><input name="face" type="checkbox" value="1" defaultChecked={ai.face} /> {dict.settings.aiFace}</label>
              <label>{dict.settings.aiRate}
                <input name="analysis_fps" type="number" min="2" max="10" defaultValue={ai.analysisFps} />
              </label>
              <label>{dict.settings.aiPerformance}
                <select name="performance" defaultValue={ai.performance}>
                  <option value="economy">{dict.settings.aiEconomy}</option>
                  <option value="balanced">{dict.settings.aiBalanced}</option>
                  <option value="quality">{dict.settings.aiQuality}</option>
                </select>
              </label>
              <button className="btn btn-primary" type="submit">{dict.settings.aiSave}</button>
            </form>
          </section>
        ) : null}
        {access.owner ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.recognition}</h2></div></div>
            <div className="panel-bd"><RecognitionForm dict={dict} settings={settings} /></div>
          </section>
        ) : null}
        {access.owner ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.ownerData}</h2></div></div>
            <div className="panel-bd"><OwnerClearForm dict={dict} overview={overview} /></div>
          </section>
        ) : null}
        {access.owner ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.purge}</h2></div></div>
            <div className="panel-bd"><PurgeForm dict={dict} purge={purge} /></div>
          </section>
        ) : null}
        {access.backup ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.backup}</h2><p>{dict.settings.backupHint}</p></div></div>
            <div className="panel-bd"><BackupForm dict={dict} /></div>
          </section>
        ) : null}
        {access.users ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.settings.users}</h2><p>{dict.settings.usersHint}</p></div></div>
            <div className="panel-bd stack">
              <UserForm dict={dict} roles={roles} owner={access.owner} />
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>{dict.common.displayName}</th><th>{dict.common.username}</th><th>{dict.common.role}</th><th>{dict.common.status}</th><th>{dict.common.actions}</th></tr></thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.displayName}{user.id === currentUserId ? ` · ${dict.settings.you}` : ""}</td>
                        <td>{user.username}</td>
                        <td>{roleName(user.role)}</td>
                        <td><Badge tone={user.active ? "ok" : "muted"}>{user.active ? dict.common.active : dict.common.archived}</Badge></td>
                        <td>
                          {user.id === currentUserId ? "—" : (
                            <div className="stack">
                              {user.active ? (
                                <ConfirmButton action={deactivateUser} fields={{ id: user.id }} label={dict.settings.deactivate} title={dict.settings.deactivateTitle} body={dict.settings.deactivateBody} confirmLabel={dict.settings.deactivate} cancelLabel={dict.common.cancel} />
                              ) : (
                                <ConfirmButton action={restoreUser} fields={{ id: user.id }} label={dict.settings.restoreUser} title={dict.settings.restoreUser} body={dict.settings.usersHint} confirmLabel={dict.settings.restoreUser} cancelLabel={dict.common.cancel} />
                              )}
                              <AccountTools dict={dict} user={user} roles={roles} owner={access.owner} />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
        {access.roles ? (
          <section className="panel">
            <div className="panel-hd"><div><h2>{dict.access.roles}</h2><p>{dict.access.rolesHint}</p></div></div>
            <div className="panel-bd"><RoleMatrix dict={dict} roles={roles} /></div>
          </section>
        ) : null}
        {access.audit ? (
        <section className="panel">
          <div className="panel-hd"><h2>{dict.settings.audit}</h2></div>
          {audit.length === 0 ? <Empty title={dict.settings.auditEmpty} /> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{dict.common.time}</th><th>{dict.common.username}</th><th>{dict.common.actions}</th><th>IP</th></tr></thead>
                <tbody>
                  {audit.map((entry) => (
                    <tr key={entry.id}>
                      <td className="num">{formatDateTime(entry.created_at, locale)}</td>
                      <td>{entry.username || "—"}</td>
                      <td>{dict.audit[entry.action] || entry.action}</td>
                      <td>{entry.ip || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}
      </div>
    </>
  );
}
