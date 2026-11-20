"use client";

import { submitDashboardCameras } from "@/app/actions/settings";

export function DashboardLive({ dict, passages, owner, visible }) {
  if (!visible) {
    if (!owner) return null;
    return (
      <section className="panel">
        <div className="panel-bd form-actions">
          <p className="muted">{dict.dashboard.camerasHidden}</p>
          <form action={submitDashboardCameras}>
            <input type="hidden" name="visible" value="1" />
            <button className="btn btn-ghost" type="submit">{dict.dashboard.showCameras}</button>
          </form>
        </div>
      </section>
    );
  }
  return (
    <section className="stack">
      {owner ? (
        <div className="form-actions">
          <form action={submitDashboardCameras}>
            <button className="btn btn-ghost" type="submit" name="visible" value="0">{dict.dashboard.hideCameras}</button>
          </form>
        </div>
      ) : null}
      {passages ? (
        <section className="panel">
          <div className="panel-hd"><h2>{dict.dashboard.confirmedFeed}</h2></div>
          {passages.length === 0 ? <p className="empty">{dict.dashboard.noConfirmed}</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{dict.common.time}</th>
                    <th>{dict.attendance.employee}</th>
                    <th>{dict.common.actions}</th>
                    <th>{dict.settings.cameras}</th>
                  </tr>
                </thead>
                <tbody>
                  {passages.map((item) => (
                    <tr key={item.id}>
                      <td className="num">{item.label}</td>
                      <td>{item.name}</td>
                      <td>{item.direction === "out" ? dict.dashboard.outEvent : dict.dashboard.inEvent}</td>
                      <td>{item.cameraCode || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
