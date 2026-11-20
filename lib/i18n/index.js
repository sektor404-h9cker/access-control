import { az } from "./az.js";
import { ru } from "./ru.js";

export function dictionary(locale) {
  return locale === "ru" ? ru : az;
}

export function dictionaryPaths(value, prefix = "") {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, nested]) =>
    dictionaryPaths(nested, prefix ? `${prefix}.${key}` : key),
  );
}
