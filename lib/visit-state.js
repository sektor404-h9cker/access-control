const BRIEF_MS = 1200;
const LEAVE_MS = 3500;

// Один непрерывный визит. Короткий пропуск кадра не завершает наблюдение.
export function stepVisit(track, sample, now) {
  const person = sample?.outcome === "matched" && sample.employeeId ? String(sample.employeeId) : "";
  const state = track || { phase: "idle", employeeId: "", streak: 0, seen: 0, offered: false, other: 0, reentry: false };
  if (!person) {
    if (state.phase === "idle" || !state.seen) return { track: state, action: "wait" };
    const gap = now - state.seen;
    if (gap < BRIEF_MS) return { track: state, action: "hold" };
    if (gap < LEAVE_MS) return { track: { ...state, phase: "gap" }, action: "hold" };
    return {
      track: { phase: "left", employeeId: state.employeeId, streak: 0, seen: state.seen, offered: false, other: 0, reentry: false },
      action: "left",
    };
  }
  if (state.seen && now - state.seen > LEAVE_MS) {
    return {
      track: {
        phase: "tracking",
        employeeId: person,
        streak: 1,
        seen: now,
        offered: false,
        other: 0,
        reentry: state.offered === true || state.phase === "left",
      },
      action: "wait",
    };
  }
  const stillHere = state.phase === "tracking" || state.phase === "present" || state.phase === "gap";
  if (stillHere && state.employeeId && state.employeeId !== person) {
    const other = (state.other || 0) + 1;
    if (other < 2) return { track: { ...state, other }, action: "hold" };
    return {
      track: { phase: "tracking", employeeId: person, streak: 1, seen: now, offered: false, other: 0, reentry: false },
      action: "wait",
    };
  }
  if (!stillHere || state.employeeId !== person) {
    return {
      track: {
        phase: "tracking",
        employeeId: person,
        streak: 1,
        seen: now,
        offered: false,
        other: 0,
        reentry: state.phase === "left" && state.employeeId === person,
      },
      action: "wait",
    };
  }
  const streak = state.streak + 1;
  const next = { ...state, phase: state.offered ? "present" : "tracking", streak, seen: now, other: 0 };
  if (!state.offered && streak >= 2) {
    return { track: { ...next, phase: "present", offered: true, reentry: false }, action: "offer", reentry: Boolean(state.reentry) };
  }
  return { track: next, action: state.offered ? "hold" : "wait" };
}
