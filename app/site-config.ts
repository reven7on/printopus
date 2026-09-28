export const SITE_NAME = "Принтопус";

export const SITE_DESCRIPTION =
  "Печать и вышивка на футболках, худи, кепках и шоперах в Минске. Заказы от 1 штуки, онлайн-конструктор и доставка по Беларуси.";

export function getSiteUrl() {
  return (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://printservice.by").replace(/\/$/, "");
}

export function isProductionDeployment() {
  return (process.env.DEPLOY_ENV ?? "production").toLowerCase() === "production";
}
