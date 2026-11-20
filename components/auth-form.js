"use client";

import { useActionState } from "react";
import { Field } from "./ui";

export function AuthForm({ dict, action, mode }) {
  const [state, formAction, pending] = useActionState(action, null);
  const error = state?.error ? dict.errors[state.error] || dict.errors.generic : null;
  return (
    <form action={formAction}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {mode === "setup" ? (
        <Field label={dict.common.displayName} name="display_name" required dict={dict} error={state?.fields?.display_name} autoComplete="name" />
      ) : null}
      <Field label={dict.common.username} name="username" required dict={dict} error={state?.fields?.username} autoComplete="username" />
      <p className="muted">{dict.auth.usernameHint}</p>
      <Field
        label={dict.common.password}
        name="password"
        type="password"
        required
        dict={dict}
        error={state?.fields?.password}
        autoComplete={mode === "setup" ? "new-password" : "current-password"}
      />
      {mode === "setup" ? (
        <Field
          label={dict.common.confirmPassword}
          name="confirm_password"
          type="password"
          required
          dict={dict}
          error={state?.fields?.confirm_password}
          autoComplete="new-password"
        />
      ) : null}
      <p className="muted">{dict.auth.passwordHint}</p>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? dict.common.loading : mode === "setup" ? dict.common.save : dict.common.login}
      </button>
    </form>
  );
}
