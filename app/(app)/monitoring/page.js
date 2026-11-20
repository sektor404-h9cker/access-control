import { connection } from "next/server";
import { LivePulse } from "@/components/live-pulse";
import { LiveRefresh } from "@/components/live-refresh";
import { MonitorDeck } from "@/components/monitor-deck";
import { HelpDesk } from "@/components/help-desk";
import { OperatorAlert } from "@/components/operator-alert";
import { RecognitionJournal } from "@/components/recognition-journal";
import { Denied, PageHeader } from "@/components/ui";
import { getAlertSettings, listAlertEvents } from "@/lib/alerts";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { activeTemplateCount } from "@/lib/face-store";
import { listOperatorEvents, recognitionStatus } from "@/lib/recognition";
import { liveBoard } from "@/lib/live-board";
import { getLocale } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";

export const instant = false;

export default async function MonitoringPage() {
  await connection();
  const user = await requireUser();
  const locale = await getLocale();
  const dict = dictionary(locale);
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return <Denied dict={dict} />;
  const cameras = liveBoard().cameras.map((camera) => ({
    ...camera,
    confirmedLabel: camera.confirmedAt ? formatDateTime(camera.confirmedAt, locale) : "",
  }));
  const canConfirm = can(user, "attendance.manual");
  const events = listOperatorEvents();
  const mode = getSettings().recognitionMode;
  const recognition = recognitionStatus();
  const templates = activeTemplateCount();
  const alertSettings = getAlertSettings();
  const alerts = listAlertEvents(20).map((entry) => ({
    id: entry.id,
    cameraCode: entry.camera_code || "",
    label: formatDateTime(entry.created_at, locale),
  }));
  return (
    <>
      <LivePulse />
      <LiveRefresh />
      <PageHeader title={dict.monitoring.title} subtitle={dict.monitoring.subtitle} />
      <MonitorDeck
        dict={dict}
        cameras={cameras}
        canControl={can(user, "settings.manage")}
        owner={user.role === "owner"}
        mode={mode}
        modelReady={recognition.available}
        templateCount={templates}
        alertSettings={alertSettings}
        canConfirm={canConfirm}
        passage={getSettings().recognitionPace !== "close"}
      />
      <OperatorAlert dict={dict} history={alerts} />
      <div style={{ marginTop: 12 }}>
        <HelpDesk dict={dict} camera={cameras.find((camera) => camera.enabled) || cameras[0]} canConfirm={canConfirm} compact />
      </div>
      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-hd">
          <div>
            <h2>{dict.monitoring.journal}</h2>
            <p>{dict.monitoring.journalHint}</p>
          </div>
        </div>
        <RecognitionJournal dict={dict} locale={locale} events={events} canConfirm={canConfirm} />
      </section>
    </>
  );
}
