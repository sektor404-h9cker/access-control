export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children ? <div className="form-actions">{children}</div> : null}
    </header>
  );
}

export function Empty({ title, body }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

export function Badge({ tone = "muted", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({ label, name, error, dict, required, as = "input", wide = false, children, ...props }) {
  const id = props.id || name;
  const message = error ? dict.errors[error] || dict.errors.invalid : null;
  const Control = as;
  return (
    <label className={wide ? "field span-2" : "field"} htmlFor={id}>
      <span>
        {label}
        {required ? <i aria-hidden="true">*</i> : null}
      </span>
      {as === "select" ? (
        <select id={id} name={name} aria-invalid={message ? "true" : undefined} {...props}>
          {children}
        </select>
      ) : (
        <Control id={id} name={name} aria-invalid={message ? "true" : undefined} {...props} />
      )}
      {message ? <small role="alert">{message}</small> : null}
    </label>
  );
}

export function ErrorBanner({ dict, code }) {
  if (!code || !/^[a-z0-9_]+$/.test(code)) return null;
  const text = dict.errors[code];
  if (!text) return null;
  return <p className="banner" role="alert">{text}</p>;
}

export function statusTone(status) {
  if (status === "on_site") return "ok";
  if (status === "late") return "warn";
  if (status === "left" || status === "trip" || status === "vacation") return "info";
  return "muted";
}

export function attendanceLabel(dict, status) {
  if (status === "on_site") return dict.attendance.statusOnSite;
  if (status === "late") return dict.attendance.statusLate;
  if (status === "left") return dict.attendance.statusLeft;
  if (status === "off") return dict.attendance.statusOff;
  if (status === "holiday") return dict.attendance.statusHoliday;
  if (status === "vacation") return dict.attendance.statusVacation;
  if (status === "sick") return dict.attendance.statusSick;
  if (status === "trip") return dict.attendance.statusTrip;
  if (status === "excused") return dict.attendance.statusExcused;
  if (status === "pending") return dict.attendance.statusPending;
  if (status === "flex") return dict.attendance.statusFlex;
  return dict.attendance.statusAbsent;
}

export function Denied({ dict }) {
  return <PageHeader title={dict.access.denied} subtitle={dict.access.deniedBody} />;
}
