import { can } from "./permissions.js";

export function isOwner(user) {
  return user?.role === "owner";
}

export function canManagePeople(user) {
  return can(user, "employees.create") || can(user, "employees.update") || can(user, "employees.archive");
}

export function canViewSensitive(user) {
  return can(user, "enrollment.manage");
}
