import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";

const sans = localFont({
  src: [
    { path: "../fonts/NotoSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/NotoSans-Medium.ttf", weight: "500", style: "normal" },
    { path: "../fonts/NotoSans-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

export const metadata = {
  title: "SMZ Access Control",
  description: "Suraxanı Maşınqayırma Zavodu — iş vaxtının uçotu",
  robots: { index: false, follow: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const instant = false;

export default async function RootLayout({ children }) {
  const jar = await cookies();
  const theme = jar.get("smz_theme")?.value === "dark" ? "dark" : "light";
  const locale = jar.get("smz_locale")?.value === "ru" ? "ru" : "az";
  return (
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className={sans.className}>{children}</body>
    </html>
  );
}
