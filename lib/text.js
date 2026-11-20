export function cleanText(value, max) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > max) return { ok: false, error: "too_long", value: "" };
  return { ok: true, value: text };
}

export function fold(value) {
  return String(value ?? "")
    .replaceAll("İ", "i")
    .replaceAll("I", "ı")
    .replaceAll("Ə", "ə")
    .toLocaleLowerCase("az");
}

export function isPhone(value) {
  if (!value) return true;
  return /^\+?[0-9][0-9\s()-]{5,30}$/.test(value);
}

export function fullName(person) {
  return [person.lastName, person.firstName, person.patronymic].filter(Boolean).join(" ");
}

export function formatMessage(template, vars = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}
