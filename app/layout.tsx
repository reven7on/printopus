import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Принтопус — центр печати на одежде в Минске",
  description: "Принтопус: печать и вышивка на одежде (футболки, худи, кепки, шоперы) в Минске с доставкой по всей Беларуси. Онлайн-конструктор и расчет за 1 минуту.",
  icons: { icon: "/logo.jpg", shortcut: "/logo.jpg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
