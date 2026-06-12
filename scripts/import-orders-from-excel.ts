import { PrismaClient } from "@prisma/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const OWNER = "이주연";
const USER_ID = "cmpz26bq90000l804ukkp72xx";
const EXCEL_PATH = path.join(process.env.USERPROFILE ?? "", "Downloads", "예시.xlsx");

type ExcelShipmentLine = { invNo: string; etd: string; lotNo: string; quantity: number; focQuantity: number; amount: number };
type ExcelPaymentLine = { type: string; date: string; amount: number; source: string };

type ExcelOrder = {
  row: number;
  country: string;
  buyer: string;
  piDate: string | null;
  piNo: string;
  productionRequestNo: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  focQuantity: number;
  amount: number;
  shipmentLines: ExcelShipmentLine[];
  paymentLines: ExcelPaymentLine[];
  registeredAt: string | null;
  registeredAmount: number | null;
};

function loadExcelOrders(): ExcelOrder[] {
  const tempDir = mkdtempSync(path.join(tmpdir(), "kup-order-import-"));
  const outputPath = path.join(tempDir, "orders.json").replace(/\\/g, "/");
  const script = `
import json, openpyxl, sys
from datetime import datetime, timedelta

def excel_date(v):
    if v is None or v == '': return None
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, (int, float)):
        return (datetime(1899,12,30) + timedelta(days=v)).date().isoformat()
    s = str(v).strip()
    if s in ('합계', '-'): return s
    return s or None

def parse_reg_month(v):
    if not v: return None
    import re
    m = re.match(r'(\\d{2})\\s*년\\s*(\\d{1,2})\\s*월', str(v).strip())
    if not m: return None
    return f"20{m.group(1)}-{int(m.group(2)):02d}-01"

path = ${JSON.stringify(EXCEL_PATH)}
output_path = ${JSON.stringify(outputPath)}
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb['Sheet1 (2)']
orders = []
pending_payments = []

def append_shipment(order, vals):
    inv = str(vals[11] or '').strip()
    etd = excel_date(vals[12])
    lot = str(vals[13] or '').strip()
    qty = int(vals[14] or 0)
    foc = int(vals[15] or 0)
    amt = round(float(vals[16] or 0), 2)
    if inv or etd or lot or qty or foc or amt:
        order['shipmentLines'].append({
            'invNo': inv,
            'etd': etd or '',
            'lotNo': lot,
            'quantity': qty,
            'focQuantity': foc,
            'amount': amt,
        })

def append_payment(order, pay_type, pay_date, pay_amount, source='엑셀'):
    if not pay_amount:
        return
    if str(pay_date or '').strip() in ('합계', '-', ''):
        return
    order['paymentLines'].append({
        'type': str(pay_type or 'T/T').strip(),
        'date': pay_date or '',
        'amount': round(float(pay_amount), 2),
        'source': source,
    })

for r in range(4, ws.max_row + 1):
    vals = [ws.cell(r, c).value for c in range(1, 27)]
    prod = str(vals[4]).strip() if vals[4] else ''
    pi = str(vals[3]).strip() if vals[3] else ''
    if prod or pi:
        if orders and pending_payments:
            orders[-1]['paymentLines'].extend(pending_payments)
            pending_payments = []
        order = {
            'row': r,
            'country': str(vals[0] or '').strip(),
            'buyer': str(vals[1] or '').strip(),
            'piDate': excel_date(vals[2]),
            'piNo': pi,
            'productionRequestNo': prod,
            'productName': str(vals[6] or vals[5] or '').strip(),
            'unitPrice': float(vals[7] or 0),
            'quantity': int(vals[8] or 0),
            'focQuantity': int(vals[9] or 0),
            'amount': round(float(vals[10] or 0), 2),
            'shipmentLines': [],
            'paymentLines': [],
            'registeredAt': parse_reg_month(vals[22]),
            'registeredAmount': round(float(vals[23]), 2) if vals[23] not in (None, '') else None,
            'pendingPayType': str(vals[17] or '').strip(),
        }
        append_shipment(order, vals)
        pay_type = str(vals[17] or '').strip()
        pay_date = excel_date(vals[18])
        pay_amount = vals[19]
        if pay_type and pay_date and str(pay_date) != '합계':
            append_payment(order, pay_type, pay_date, pay_amount)
        orders.append(order)
        continue
    pay_date = excel_date(vals[18])
    pay_amount = vals[19]
    if pay_date and pay_amount and orders:
        pay_type = orders[-1].get('pendingPayType') or 'T/T'
        pending_payments.append({
            'type': pay_type,
            'date': pay_date,
            'amount': round(float(pay_amount), 2),
            'source': '엑셀',
        })

if orders and pending_payments:
    orders[-1]['paymentLines'].extend(pending_payments)

for order in orders:
    order.pop('pendingPayType', None)
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(orders, f, ensure_ascii=False)
`;

  const result = spawnSync("python", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" }
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    throw new Error("Failed to parse Excel file");
  }
  try {
    return JSON.parse(readFileSync(outputPath, "utf8")) as ExcelOrder[];
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function piDateFromPiNo(piNo: string) {
  const match = piNo.match(/KUP-(\d{2})(\d{2})(\d{2})/i);
  if (!match) return null;
  return new Date(Date.UTC(Number(`20${match[1]}`), Number(match[2]) - 1, Number(match[3])));
}

function matchKey(order: { productionRequestNo?: string | null; piNo?: string | null; quantity?: number | null }) {
  return `${(order.productionRequestNo ?? "").trim()}|${(order.piNo ?? "").trim()}|${order.quantity ?? 0}`;
}

async function main() {
  const prisma = new PrismaClient();
  const excelOrders = loadExcelOrders();
  const existing = await prisma.orderEntry.findMany({ where: { salesOwner: OWNER } });

  const existingByKey = new Map(existing.map((row) => [matchKey(row), row]));
  const usedIds = new Set<string>();

  let created = 0;
  let updated = 0;

  for (const item of excelOrders) {
    const key = matchKey(item);
    const current = existingByKey.get(key);
    const piDate = item.piDate ? new Date(`${item.piDate}T00:00:00.000Z`) : piDateFromPiNo(item.piNo);

    const data = {
      salesOwner: OWNER,
      exportCountry: item.country,
      buyer: item.buyer,
      piDate,
      piNo: item.piNo,
      productionRequestNo: item.productionRequestNo,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      focQuantity: item.focQuantity,
      amount: item.amount,
      shipmentLines: item.shipmentLines,
      paymentLines: item.paymentLines,
      updatedById: USER_ID
    };

    let entryId: string;
    if (current && !usedIds.has(current.id)) {
      await prisma.orderEntry.update({ where: { id: current.id }, data });
      entryId = current.id;
      usedIds.add(current.id);
      updated += 1;
    } else {
      const createdRow = await prisma.orderEntry.create({
        data: { ...data, createdById: USER_ID }
      });
      entryId = createdRow.id;
      created += 1;
    }

    if (item.registeredAt && item.registeredAmount) {
      const orderKey = `entry:${entryId}`;
      await prisma.salesRegistration.upsert({
        where: { orderKey_salesOwner: { orderKey, salesOwner: OWNER } },
        update: {
          exportCountry: item.country,
          buyer: item.buyer,
          piNo: item.piNo,
          productionRequestNo: item.productionRequestNo,
          amount: item.registeredAmount,
          registeredAt: new Date(`${item.registeredAt}T00:00:00.000Z`),
          status: "REGISTERED",
          updatedById: USER_ID
        },
        create: {
          orderKey,
          salesOwner: OWNER,
          exportCountry: item.country,
          buyer: item.buyer,
          piNo: item.piNo,
          productionRequestNo: item.productionRequestNo,
          amount: item.registeredAmount,
          registeredAt: new Date(`${item.registeredAt}T00:00:00.000Z`),
          status: "REGISTERED",
          createdById: USER_ID,
          updatedById: USER_ID
        }
      });
    }
  }

  const total = await prisma.orderEntry.count({ where: { salesOwner: OWNER } });
  console.log(`Excel rows: ${excelOrders.length}`);
  console.log(`Created: ${created}, Updated: ${updated}`);
  console.log(`Total OrderEntry for ${OWNER}: ${total}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
