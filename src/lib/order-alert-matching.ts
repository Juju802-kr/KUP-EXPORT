import { findRegisteredProduct, type ExportProductOption } from "@/lib/order-pi-import";

export type OrderAlertMatchInput = {
  exportCountry: string;
  productName: string;
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalProductKey(
  exportCountry: string,
  productName: string,
  exportProducts: ExportProductOption[]
) {
  const country = exportCountry.trim();
  const name = productName.trim();
  if (!country || !name) return "";
  const matched = findRegisteredProduct(country, name, exportProducts);
  if (matched) return `${country}::${normalizeLabel(matched.productName)}`;
  return `${country}::${normalizeLabel(name)}`;
}

export function orderMatchesAlert(
  order: OrderAlertMatchInput,
  alert: OrderAlertMatchInput,
  exportProducts: ExportProductOption[] = []
) {
  const orderCountry = order.exportCountry.trim();
  const alertCountry = alert.exportCountry.trim();
  if (!orderCountry || !alertCountry || orderCountry !== alertCountry) return false;

  const orderProduct = order.productName.trim();
  const alertProduct = alert.productName.trim();
  if (!orderProduct || !alertProduct) return false;

  if (normalizeLabel(orderProduct) === normalizeLabel(alertProduct)) return true;

  if (!exportProducts.length) return false;

  return (
    canonicalProductKey(orderCountry, orderProduct, exportProducts) ===
    canonicalProductKey(alertCountry, alertProduct, exportProducts)
  );
}
