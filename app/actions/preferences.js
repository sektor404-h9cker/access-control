"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, setPreferenceCookie } from "@/lib/session";
import { updateUserPreferences } from "@/lib/users";

export async function setLocale(locale) {
  if (locale !== "az" && locale !== "ru") return;
  await setPreferenceCookie("smz_locale", locale);
  const user = await getCurrentUser();
  if (user) updateUserPreferences(user.id, { locale });
  revalidatePath("/", "layout");
}

export async function setTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  await setPreferenceCookie("smz_theme", theme);
  const user = await getCurrentUser();
  if (user) updateUserPreferences(user.id, { theme });
  revalidatePath("/", "layout");
}
