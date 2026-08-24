import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_DESCRIPTION } from "../site-config";

export const metadata: Metadata = {
  title: "Онлайн-конструктор одежды",
  description: "Создайте макет принта на одежде, выберите изделие и тираж и получите предварительный расчёт стоимости онлайн.",
  alternates: { canonical: "/configurator" },
  openGraph: {
    type: "website",
    url: "/configurator",
    title: "Онлайн-конструктор одежды — Принтопус",
    description: SITE_DESCRIPTION,
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "Принтопус — онлайн-конструктор одежды",
    }],
  },
};

export default function ConfiguratorLayout({ children }: { children: ReactNode }) {
  return children;
}
