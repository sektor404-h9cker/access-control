import "server-only";
import { redirect } from "next/navigation";
import { clientIp } from "./meta.js";
import { can } from "./permissions.js";
import { getCurrentUser } from "./session.js";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function actionContext(permission = "any") {
  const user = await requireUser();
  if (permission !== "any" && !can(user, permission)) return { error: "forbidden" };
  return {
    user,
    meta: { actor: { id: user.id, username: user.username }, ip: await clientIp() },
  };
}
