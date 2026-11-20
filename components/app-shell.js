"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Clock } from "./clock";
import { Icon } from "./icons";
import { PreferenceSwitch } from "./preference-switch";

const LINKS = [
  { href: "/", key: "dashboard", group: "ops", icon: "grid", permission: "dashboard.view" },
  { href: "/monitoring", key: "monitoring", group: "ops", icon: "camera", permission: "monitoring.view" },
  { href: "/attendance", key: "attendance", group: "ops", icon: "clock", permission: "attendance.view" },
  { href: "/employees", key: "employees", group: "personnel", icon: "users", permission: "employees.view" },
  { href: "/departments", key: "departments", group: "personnel", icon: "building", permission: "departments.view" },
  { href: "/reports", key: "reports", group: "system", icon: "file", permission: "reports.view" },
  {
    href: "/settings",
    key: "settings",
    group: "system",
    icon: "settings",
    any: ["settings.view", "settings.manage", "cameras.view", "users.manage", "roles.manage", "backup.create", "audit.view"],
  },
];

export function AppShell({ dict, locale, theme, user, enterprise, demo, initialIso, children }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState(null);
  const open = openPath === pathname;
  const granted = new Set(user.permissions || []);
  const items = LINKS.filter((item) => (item.any ? item.any.some((key) => granted.has(key)) : granted.has(item.permission)) && (!item.ownerOnly || user.role === "owner"));
  const current = items.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") setOpenPath(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
      <a className="skip" href="#content">{dict.common.internal}</a>
      {open ? <button className="backdrop" aria-label={dict.common.closeMenu} onClick={() => setOpenPath(null)} /> : null}
      <aside className="sidebar" data-open={open ? "true" : "false"}>
        <div className="brand">
          <div className="mark">SMZ</div>
          <div>
            <strong>Access Control</strong>
            <span>{enterprise}</span>
          </div>
        </div>
        <nav className="nav" aria-label={dict.common.internal}>
          {["ops", "personnel", "system"].map((group) => (
            <div key={group}>
              <p className="nav-label">{dict.groups[group]}</p>
              {items.filter((item) => item.group === group).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link"
                  data-active={current?.href === item.href ? "true" : "false"}
                  aria-current={current?.href === item.href ? "page" : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{dict.nav[item.key]}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">0.1.0 · {dict.common.internal}</div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="icon-btn menu-btn" type="button" aria-label={dict.common.openMenu} onClick={() => setOpenPath(pathname)}>
            <Icon name="menu" />
          </button>
          <h1>{current ? dict.nav[current.key] : dict.nav.dashboard}</h1>
          <div className="spacer" />
          <Clock locale={locale} initialIso={initialIso} />
          <PreferenceSwitch dict={dict} locale={locale} theme={theme} />
          <div className="who" aria-label={dict.common.account}>
            <b>{user.displayName}</b>
            <span>{user.roleLabel || dict.roles[user.role] || user.role}</span>
          </div>
          <form action={logout}>
            <button className="btn btn-ghost" type="submit">{dict.common.logout}</button>
          </form>
        </header>
        <main id="content" className="page">
          {demo ? <p className="banner banner-info">{dict.dashboard.demoBanner}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
