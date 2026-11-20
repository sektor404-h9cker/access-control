"use client";

import { useRef } from "react";

export function ConfirmButton({ action, fields, label, title, body, confirmLabel, cancelLabel, disabled }) {
  const dialogRef = useRef(null);
  return (
    <>
      <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => dialogRef.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialogRef}>
        <form action={action} onSubmit={() => dialogRef.current?.close()}>
          {Object.entries(fields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <h3>{title}</h3>
          <p>{body}</p>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>{cancelLabel}</button>
            <button type="submit" className="btn btn-danger">{confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
