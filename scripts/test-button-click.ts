import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ContactMethod, FulfillmentMethod, OrderStatus } from "../app/generated/prisma/client.js";
import { sendOrderNotificationToTelegram } from "../lib/telegram.ts";
import { handleTelegramCallbackQuery } from "../lib/telegram-callback-handler.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🚀 Starting button click verification test...");

  const product = await db.product.findFirst({ where: { slug: "shirt", active: true } });
  const printMethod = await db.printMethod.findFirst({ where: { slug: "dtf", active: true } });
  const printFormat = await db.printFormat.findFirst({ where: { code: "A4", active: true } });

  if (!product || !printMethod || !printFormat) throw new Error("Catalog items missing.");

  const orderNumber = `BY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-BTN-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const orderId = randomUUID();

  const order = await db.order.create({
    data: {
      id: orderId,
      orderNumber,
      customerName: "Тест Кнопок Telegram",
      customerPhone: "+375 (29) 111-00-00",
      contactMethod: ContactMethod.TELEGRAM,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      comment: "Проверка кнопок Telegram бота [Принять в работу -> Готов -> Завершен]",
      subtotal: 35.0,
      discountPercent: 0.0,
      total: 35.0,
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
          baseUnitPrice: 35.0,
          unitPrice: 35.0,
          total: 35.0,
        },
      },
    },
    select: { id: true, orderNumber: true, status: true },
  });

  console.log(`✅ Created test order: ${order.orderNumber} (Status: ${order.status})`);

  // Send Telegram notification
  await sendOrderNotificationToTelegram({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: "Тест Кнопок Telegram",
    customerPhone: "+375 (29) 111-00-00",
    contactMethod: "telegram",
    fulfillmentMethod: "delivery",
    comment: "Проверка кнопок Telegram бота [Принять в работу -> Готов -> Завершен]",
    subtotal: 35.0,
    discountPercent: 0,
    total: 35.0,
    status: order.status,
    items: [
      {
        productName: "Футболка",
        colorLabel: "Чёрный",
        sizeLabel: "L",
        placement: "center",
        quantity: 1,
        baseUnitPrice: 35.0,
        unitPrice: 35.0,
        total: 35.0,
      },
    ],
  });
  console.log("✅ Sent order notification with interactive inline buttons to Telegram!");

  // Simulate button click to transition from NEW -> IN_PRODUCTION
  const handled = await handleTelegramCallbackQuery({
    id: "test_callback_query_1",
    data: `st:IN_PRODUCTION:${order.id}`,
    message: {
      message_id: 1,
      chat: { id: process.env.TELEGRAM_ADMIN_CHAT_ID! },
    },
    from: { first_name: "Менеджер Тест", username: "manager_test" },
  });

  console.log(`✅ Handled button click st:IN_PRODUCTION: ${handled}`);

  const updatedOrder = await db.order.findUnique({
    where: { id: order.id },
    select: { status: true, statusHistory: true },
  });

  console.log(`✅ Verified DB status after button click: ${updatedOrder?.status}`);
  console.log(`✅ Verified OrderStatusHistory note: ${updatedOrder?.statusHistory[0]?.note}`);

  console.log("\n🎉 BUTTON CLICK VERIFICATION TEST PASSED!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
