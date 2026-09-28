import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.TEST_SITE_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
const uploadId = "live-back-logo";
const common = (id, type, name, x, y, width) => ({
  id,
  type,
  name,
  x,
  y,
  width,
  scale: 1,
  rotation: 0,
});

const payload = {
  customerName: "LIVE TEST — 4 РАКУРСА",
  customerPhone: "+375 (29) 111-00-00",
  contactMethod: "telegram",
  fulfillmentMethod: "pickup",
  comment: "Проверка Telegram: перед — текст и звезда; спина — картинка, текст и корона; левый рукав — текст и молния; правый рукав — огонь.",
  productSlug: "shirt",
  color: "black",
  size: "xl",
  printMethodSlug: "dtf",
  printFormatCode: "A4",
  placement: "center",
  quantity: 1,
  design: {
    front: [
      { ...common("live-front-text", "text", "Текст", 50, 35, 58), content: "ПЕРЕД / TEXT", color: "#ffffff", fontFamily: "Montserrat", fontWeight: 800, outlined: true },
      { ...common("live-front-star", "shape", "Звезда", 50, 68, 32), content: "star", color: "#22c55e" },
    ],
    back: [
      { ...common("live-back-image", "image", "Логотип", 50, 37, 48), uploadId, aspectRatio: 1, quality: "good" },
      { ...common("live-back-text", "text", "Текст", 50, 72, 62), content: "СПИНА / IMAGE + TEXT", color: "#eab308", fontFamily: "Montserrat", fontWeight: 800 },
      { ...common("live-back-crown", "shape", "Корона", 50, 15, 28), content: "crown", color: "#eab308" },
    ],
    sleeve_left: [
      { ...common("live-left-text", "text", "Текст", 50, 35, 74), content: "LEFT", color: "#38bdf8", fontFamily: "Inter", fontWeight: 800 },
      { ...common("live-left-lightning", "shape", "Молния", 50, 68, 36), content: "lightning", color: "#38bdf8" },
    ],
    sleeve_right: [
      { ...common("live-right-flame", "shape", "Огонь", 50, 50, 46), content: "flame", color: "#ef4444" },
    ],
  },
};

const logo = await readFile(path.join(process.cwd(), "public", "test-octopus-logo.png"));
const formData = new FormData();
formData.append("order", JSON.stringify(payload));
formData.append("fileUploadIds", JSON.stringify([uploadId]));
formData.append("files", new File([logo], "octopus-on-back.png", { type: "image/png" }));

const response = await fetch(`${baseUrl}/api/orders`, { method: "POST", body: formData });
const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error("Multiview order was rejected:", response.status, body);
  process.exit(1);
}
console.info(JSON.stringify({
  id: body.order.id,
  orderNumber: body.order.orderNumber,
  status: body.order.status,
  assetCount: body.order.assetCount,
}, null, 2));
