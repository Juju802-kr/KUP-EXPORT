import { ShipmentSummaryClient } from "@/components/ShipmentSummaryClient";
import { prisma } from "@/lib/prisma";

export default async function ShipmentSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [shipment, defaultNotes] = await Promise.all([
    prisma.shipmentRequest.findUnique({
      where: { id },
      include: { products: { orderBy: { createdAt: "asc" } } }
    }),
    prisma.shipmentSummaryDefaultNote.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
  ]);

  if (!shipment) {
    return <div className="p-8 text-sm text-slate-600">선적의뢰를 찾을 수 없습니다.</div>;
  }

  const buyerMaster = shipment.buyer
    ? await prisma.buyerMaster.findFirst({
        where: { buyerName: shipment.buyer },
        orderBy: { updatedAt: "desc" }
      })
    : null;

  return (
    <ShipmentSummaryClient
      shipment={{
        id: shipment.id,
        invNo: shipment.invNo,
        transport: shipment.transport,
        storageCondition: shipment.storageCondition,
        exportCountry: shipment.exportCountry,
        buyer: shipment.buyer,
        usePt: shipment.usePt,
        ptQty: shipment.ptQty,
        summaryDataLogger: shipment.summaryDataLogger,
        summaryDataLoggerDetail: shipment.summaryDataLoggerDetail,
        summaryShippingLabelMethod: shipment.summaryShippingLabelMethod,
        summarySpecialNotes: shipment.summarySpecialNotes,
        products: shipment.products.map((product) => ({
          id: product.id,
          productName: product.productName,
          englishName: product.englishName,
          factory: product.factory,
          lotNo: product.lotNo,
          bxQtyPaid: product.bxQtyPaid,
          bxQtyFoc: product.bxQtyFoc,
          bxQtyTotal: product.bxQtyTotal,
          normalBoxQty: product.normalBoxQty,
          iceBoxQty: product.iceBoxQty,
          injectionBoxQty: product.injectionBoxQty,
          commonBoxQty: product.commonBoxQty
        })),
        vatNo: buyerMaster?.vatNo ?? null,
        eoriNo: buyerMaster?.eoriNo ?? null
      }}
      defaultNotes={defaultNotes.map((note) => ({
        id: note.id,
        content: note.content,
        sortOrder: note.sortOrder
      }))}
    />
  );
}
