import { requireAdminPage } from "../../../../../lib/admin-auth";
import OrderDetail from "./order-detail";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  return <OrderDetail orderId={id} />;
}
