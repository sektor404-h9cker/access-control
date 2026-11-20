import { connection } from "next/server";
import { Clock } from "@/components/clock";
import { DashboardLive } from "@/components/dashboard-live";
import { MonitorDeck } from "@/components/monitor-deck";
import { LivePulse } from "@/components/live-pulse";
import { Badge, Denied } from "@/components/ui";
import { dashboardSnapshot } from "@/lib/dashboard";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { liveBoard } from "@/lib/live-board";
import { can } from "@/lib/permissions";
import { getLocale } from "@/lib/session";
import { activeTemplateCount } from "@/lib/face-store";
import { recognitionStatus } from "@/lib/recognition";
import { getAlertSettings } from "@/lib/alerts";
import { getSettings } from "@/lib/settings";
import { bakuStamp, formatDateKey, formatDateTime } from "@/lib/time";
import { formatMessage } from "@/lib/text";

export const instant = false;

function Chart({ series, empty }) {
  const total = series.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <p className="muted">{empty}</p>;
  const max = Math.max(...series.map((item) => item.value), 1);
  const width = 36;
  return (
    <svg className="chart" viewBox={`0 0 ${series.length * width + 8} 160`} role="img">
      {series.map((item, index) => {
        const bar = Math.max(2, (item.value / max) * 108);
        const x = 8 + index * width;
        return (
          <g key={item.date}>
            <rect className="chart-bar" x={x} y={124 - bar} width="18" height={bar} rx="3" />
            <text className="chart-label" x={x + 9} y="146" textAnchor="middle">{formatDateKey(item.date).slice(0, 5)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function DashboardPage() {
  await connection();
  const user = await requireUser();
  const locale = await getLocale();
  const dict = dictionary(locale);
  if (!can(user, "dashboard.view")) return <Denied dict={dict} />;
  const data = dashboardSnapshot();
  const settings = getSettings();
  const seeCameras = can(user, "cameras.view") || can(user, "monitoring.view");
  const seePassages = can(user, "attendance.view") || can(user, "monitoring.view");
  const board = seeCameras || user.role === "owner" ? liveBoard() : { cameras: [], passages: [] };
  const cameras = seeCameras ? board.cameras.map((camera) => ({
    ...camera,
    confirmedLabel: camera.confirmedAt ? formatDateTime(camera.confirmedAt, locale) : "",
  })) : [];
  const passages = seePassages ? board.passages.map((item) => ({
    id: item.id,
    label: formatDateTime(item.at, locale),
    name: [item.last_name, item.first_name, item.patronymic].filter(Boolean).join(" "),
    direction: item.direction,
    cameraCode: item.camera_code || "",
  })) : null;
  const initialIso = bakuStamp().iso;
  const cards = [
    ["total", data.counts.total, dict.dashboard.totalEmployees, dict.dashboard.totalHint, "tone-accent"],
    ["onSite", data.counts.onSite, dict.dashboard.onSite, dict.dashboard.onSiteHint, "tone-ok"],
    ["absent", data.counts.absent, dict.dashboard.absent, dict.dashboard.absentHint, "tone-muted"],
    ["late", data.counts.late, dict.dashboard.late, dict.dashboard.lateHint, "tone-warn"],
    ["left", data.counts.left, dict.dashboard.left, dict.dashboard.leftHint, "tone-info"],
  ];
  return (
    <>
      <LivePulse />
      <div className="clock-band">
        <div>
          <h1 style={{ margin: 0 }}>{dict.dashboard.title}</h1>
          <p className="tz">{dict.dashboard.subtitle}</p>
        </div>
        <div>
          <Clock locale={locale} large initialIso={initialIso} />
          <p className="tz">{dict.dashboard.timezone}</p>
        </div>
      </div>
      <section className="stats">
        {cards.map(([key, value, title, hint, tone]) => (
          <article key={key} className={`stat ${tone}`}>
            <span>{title}</span>
            <b>{value}</b>
            <small>{hint}</small>
          </article>
        ))}
      </section>
      {seeCameras && settings.dashboardCameras ? (
        <MonitorDeck
          dict={dict}
          cameras={cameras}
          canControl={can(user, "settings.manage")}
          owner={user.role === "owner"}
          mode={settings.recognitionMode}
          modelReady={recognitionStatus().available}
          templateCount={activeTemplateCount()}
          alertSettings={getAlertSettings()}
          canConfirm={can(user, "attendance.manual")}
          passage={settings.recognitionPace !== "close"}
        />
      ) : null}
      <DashboardLive
        dict={dict}
        passages={passages}
        layout={settings.dashboardCameraLayout}
        owner={user.role === "owner"}
        visible={settings.dashboardCameras}
      />
      <div className="grid-2">
        <section className="panel">
          <div className="panel-hd">
            <div>
              <h2>{dict.dashboard.chartTitle}</h2>
              <p>{dict.dashboard.chartCaption}</p>
            </div>
          </div>
          <div className="panel-bd"><Chart series={data.series} empty={dict.dashboard.chartEmpty} /></div>
        </section>
        <section className="panel">
          <div className="panel-hd"><h2>{dict.dashboard.system}</h2></div>
          <div className="panel-bd">
            <dl className="kv">
              <div><dt>{dict.dashboard.db}</dt><dd><Badge tone="ok">{dict.dashboard.dbOk}</Badge></dd></div>
              <div><dt>{dict.dashboard.mode}</dt><dd>{data.system.dataMode === "demo" ? dict.dashboard.modeDemo : dict.dashboard.modeProduction}</dd></div>
              <div><dt>{dict.dashboard.cameras}</dt><dd>{cameras.filter((camera) => camera.enabled).length ? formatMessage(dict.dashboard.camerasSaved, { count: cameras.filter((camera) => camera.enabled).length }) : dict.dashboard.camerasDown}</dd></div>
              <div><dt>{dict.dashboard.lastBackup}</dt><dd>{data.system.lastBackup || dict.dashboard.noBackup}</dd></div>
              <div><dt>{dict.dashboard.lastAudit}</dt><dd>{data.system.lastAudit ? `${dict.audit[data.system.lastAudit.action] || data.system.lastAudit.action}` : dict.dashboard.noAudit}</dd></div>
            </dl>
          </div>
        </section>
      </div>
      <div className="grid-main grid-2">
        <section className="panel">
          <div className="panel-hd"><h2>{dict.dashboard.recent}</h2></div>
          {data.recent.length === 0 ? <p className="empty">{dict.dashboard.recentEmpty}</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{dict.common.time}</th><th>{dict.attendance.employee}</th><th>{dict.employees.department}</th><th>{dict.common.actions}</th></tr></thead>
                <tbody>
                  {data.recent.map((event) => (
                    <tr key={event.id}>
                      <td className="num">{formatDateTime(event.at, locale)}</td>
                      <td>{event.name}</td>
                      <td>{event.departmentName || dict.dashboard.noDepartment}</td>
                      <td>{event.kind === "out" ? dict.dashboard.outEvent : dict.dashboard.inEvent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-hd"><h2>{dict.dashboard.departments}</h2></div>
          {data.departments.length === 0 ? <p className="empty">{dict.dashboard.departmentsEmpty}</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{dict.departments.name}</th>
                    <th>{dict.dashboard.headcount}</th>
                    <th>{dict.dashboard.onSite}</th>
                    <th>{dict.dashboard.absent}</th>
                    <th>{dict.dashboard.late}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((department) => (
                    <tr key={department.id}>
                      <td>{department.unassigned ? dict.dashboard.noDepartment : department.name}</td>
                      <td className="num">{department.headcount}</td>
                      <td className="num">{department.onSite}</td>
                      <td className="num">{department.absent}</td>
                      <td className="num">{department.late}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
