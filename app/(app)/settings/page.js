import { connection } from "next/server";
import { SettingsBoard } from "@/components/settings-board";
import { Denied } from "@/components/ui";
import { listRoles } from "@/lib/access";
import { recentAudit } from "@/lib/audit";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { getLocale } from "@/lib/session";
import { previewDemoPurge } from "@/lib/demo-purge";
import { previewOwnerData } from "@/lib/owner-data";
import { getAlertSettings } from "@/lib/alerts";
import { getAiSettings } from "@/lib/vision-settings";
import { getSettings, listCameras } from "@/lib/settings";
import { listUsers } from "@/lib/users";

export const instant = false;

function one(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function SettingsPage({ searchParams }) {
  await connection();
  const user = await requireUser();
  const locale = await getLocale();
  const dict = dictionary(locale);
  const access = {
    org: can(user, "settings.manage"),
    orgView: can(user, "settings.view") || can(user, "settings.manage"),
    cameras: can(user, "cameras.view") || can(user, "settings.manage"),
    assign: can(user, "settings.manage"),
    users: can(user, "users.manage"),
    roles: can(user, "roles.manage"),
    backup: can(user, "backup.create"),
    audit: can(user, "audit.view"),
    owner: user.role === "owner",
  };
  if (!Object.values(access).some(Boolean)) return <Denied dict={dict} />;
  const params = await searchParams;
  return (
    <SettingsBoard
      dict={dict}
      locale={locale}
      settings={getSettings()}
      cameras={access.cameras ? listCameras() : null}
      users={access.users ? listUsers() : null}
      roles={access.roles || access.users ? listRoles(locale) : []}
      access={access}
      audit={access.audit ? recentAudit(40) : []}
      currentUserId={user.id}
      purge={user.role === "owner" ? previewDemoPurge() : null}
      overview={user.role === "owner" ? previewOwnerData() : null}
      alert={access.assign ? getAlertSettings() : null}
      ai={access.owner ? getAiSettings() : null}
      error={one(params.error)}
    />
  );
}
