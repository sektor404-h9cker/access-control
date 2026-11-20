export function Icon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    className: "icon",
  };
  if (name === "grid") {
    return <svg {...common}><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>;
  }
  if (name === "camera") {
    return <svg {...common}><path d="M4 8h4l2-2h4l2 2h4v10H4z" /><circle cx="12" cy="13" r="3" /></svg>;
  }
  if (name === "clock") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>;
  }
  if (name === "users") {
    return <svg {...common}><path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" /><circle cx="9.5" cy="7.5" r="2.5" /><path d="M20 20v-1a3.5 3.5 0 0 0-3-3.45" /><path d="M16 5.1a2.5 2.5 0 0 1 0 4.8" /></svg>;
  }
  if (name === "building") {
    return <svg {...common}><path d="M4 20h16M6 20V5h8v15M14 9h4v11" /><path d="M8 8h2M8 12h2M8 16h2" /></svg>;
  }
  if (name === "file") {
    return <svg {...common}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
  }
  if (name === "settings") {
    return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>;
  }
  if (name === "scan") {
    return <svg {...common}><path d="M4 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" /><circle cx="12" cy="12" r="3" /></svg>;
  }
  if (name === "menu") {
    return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  }
  return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
