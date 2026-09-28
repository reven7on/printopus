import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ContactMethod, FulfillmentMethod, OrderStatus } from "../app/generated/prisma/client";
import { sendOrderNotificationToTelegram } from "../lib/telegram.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🚀 Starting button click verification test...");

  const product = await db.product.findFirst({ where: { slug: "shirt", active: true } });
  const printMethod = await db.printMethod.findFirst({ where: { slug: "dtf", active: true } });
  const printFormat = await db.printFormat.findFirst({ where: { code: "A4", active: true } });

  if (!product || !printMethod || !printFormat) throw new Error("Catalog items missing.");

  const orderNumber = `BY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-REAL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const orderId = randomUUID();

  const order = await db.order.create({
    data: {
      id: orderId,
      orderNumber,
      customerName: "Тест Кнопок Telegram (Реальный Заказ)",
      customerPhone: "+375 (29) 111-00-00",
      contactMethod: ContactMethod.TELEGRAM,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      comment: "Свежий заказ для проверки нажатия кнопок в Telegram!",
      subtotal: 45.0,
      discountPercent: 0.0,
      total: 45.0,
      status: OrderStatus.NEW,
      items: {
        create: {
          productId: product.id,
          printMethodId: printMethod.id,
          printFormatId: printFormat.id,
          productName: product.name,
          colorLabel: "Чёрный",
          sizeLabel: "L",
          placement: "center",
          quantity: 1,
          baseUnitPrice: 45.0,
          unitPrice: 45.0,
          total: 45.0,
        },
      },
    },
    select: { id: true, orderNumber: true, status: true },
  });

  console.log(`✅ Created order in DB: #${order.orderNumber} (ID: ${order.id})`);

  // Send Telegram notification
  await sendOrderNotificationToTelegram({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: "Тест Кнопок Telegram (Реальный Заказ)",
    customerPhone: "+375 (29) 111-00-00",
    contactMethod: "telegram",
    fulfillmentMethod: "delivery",
    comment: "Свежий заказ для проверки нажатия кнопок в Telegram!",
    subtotal: 45.0,
    discountPercent: 0,
    total: 45.0,
    status: order.status,
    items: [
      {
        productName: "Футболка Oversize",
        colorLabel: "Чёрный",
        sizeLabel: "L",
        placement: "center",
        quantity: 1,
        baseUnitPrice: 45.0,
        unitPrice: 45.0,
        total: 45.0,
      },
    ],
  });

  console.log(`\n🎉 Свежий заказ #${order.orderNumber} успешно отправлен в Telegram!`);
  console.log(`Нажмите кнопку [ ✅ Принять в работу ] в Telegram прямо сейчас!`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
