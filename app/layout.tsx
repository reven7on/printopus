import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["cyrillic", "latin"] });

export const metadata: Metadata = {
  title: "Принтопус — центр печати на одежде в Минске",
  description: "Принтопус: печать и вышивка на одежде (футболки, худи, кепки, шоперы) в Минске с доставкой по всей Беларуси. Онлайн-конструктор и расчет за 1 минуту.",
  other: { "codex-preview": "development" },
  icons: { icon: "/logo.jpg", shortcut: "/logo.jpg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={manrope.variable}>{children}</body></html>;
}
