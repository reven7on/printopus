"use client";

import { useEffect, useState } from "react";

export type PublicCatalog = {
  currency: "BYN";
  products: Array<{
    slug: string;
    name: string;
    kind: string;
    description: string | null;
    basePrice: number;
    options: Array<{
      type: "COLOR" | "SIZE";
      value: string;
      label: string;
      colorHex: string | null;
      priceDelta: number;
    }>;
  }>;
  printMethods: Array<{ slug: string; name: string; description: string | null; priceDelta: number }>;
  printFormats: Array<{ code: string; widthCm: number; heightCm: number; priceDelta: number }>;
  volumeDiscounts: Array<{ minQuantity: number; percent: number }>;
};

export function usePublicCatalog() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/catalog", { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() as Promise<PublicCatalog> : Promise.reject())
      .then((result) => { if (active) setCatalog(result); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return catalog;
}
