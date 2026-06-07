import { AttachmentOwnerType, DropdownCategory } from "@prisma/client";
import { ShipmentDetailEditor } from "@/components/ShipmentDetailEditor";
import { fmtDate, fmtDateTimeLocal } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { shipmentDisplayTitle } from "@/lib/shipment-title";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [shipment, dropdowns, productMasters, attachments] = await Promise.all([
    prisma.shipmentRequest.findUnique({ where: { id }, include: { products: { orderBy: { createdAt: "asc" } } } }),
    prisma.dropdownOption.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    prisma.productMaster.findMany({ orderBy: { name: "asc" } }),
    prisma.attachment.findMany({ where: { ownerType: AttachmentOwnerType.SHIPMENT, ownerId: id }, orderBy: { createdAt: "desc" } })
  ]);
  if (!shipment) return <div>선적의뢰를 찾을 수 없습니다.</div>;

  const productionNos = shipment.products.map((product) => product.productionRequestNo).filter(Boolean) as string[];
  const [lcs, productAttachments, buyerMaster] = await Promise.all([
    productionNos.length || shipment.linkedLcId
      ? prisma.paymentLC.findMany({
          where: {
            OR: [
              ...(productionNos.length ? [{ productionRequestNo: { in: productionNos } }] : []),
              ...(shipment.linkedLcId ? [{ id: shipment.linkedLcId }] : [])
            ]
          },
          orderBy: { createdAt: "desc" }
        })
      : [],
    shipment.products.length
      ? prisma.attachment.findMany({
          where: { ownerType: AttachmentOwnerType.SHIPMENT_PRODUCT, ownerId: { in: shipment.products.map((product) => product.id) } },
          orderBy: { createdAt: "desc" }
        })
      : [],
    shipment.buyer
      ? prisma.buyerMaster.findFirst({
          where: { buyerName: shipment.buyer },
          orderBy: { updatedAt: "desc" }
        })
      : null
  ]);
  const buyerAttachments = buyerMaster
    ? await prisma.attachment.findMany({
        where: { ownerType: AttachmentOwnerType.BUYER_MASTER, ownerId: buyerMaster.id },
        orderBy: { createdAt: "desc" }
      })
    : [];

  const optionValues = (category: DropdownCategory) =>
    dropdowns
      .filter((option) => option.category === category)
      .map((option) => ({ id: option.id, value: option.value, label: option.label }));

  const autoLinkedLc = shipment.linkedLcId ? lcs.find((lc) => lc.id === shipment.linkedLcId) : lcs[0];
  if (!shipment.linkedLcId && autoLinkedLc) {
    await prisma.lcShipmentLink.deleteMany({ where: { shipmentId: shipment.id } });
    await prisma.lcShipmentLink.create({ data: { shipmentId: shipment.id, lcId: autoLinkedLc.id, createdById: shipment.updatedById } });
    await prisma.shipmentRequest.update({
      where: { id: shipment.id },
      data: { linkedLcId: autoLinkedLc.id, lcSd: autoLinkedLc.lcSd, updatedById: shipment.updatedById }
    });
  }

  return (
    <ShipmentDetailEditor
      shipment={{
        id: shipment.id,
        status: shipment.status,
        title: shipmentDisplayTitle(shipment) || "선적의뢰",
        exportCountry: shipment.exportCountry,
        buyer: shipment.buyer,
        transport: shipment.transport,
        destinationPort: shipment.destinationPort,
        storageCondition: shipment.storageCondition,
        incoterms: shipment.incoterms,
        paymentTerm: shipment.paymentTerm,
        forwarder: shipment.forwarder,
        departurePort: shipment.departurePort,
        transitFlight: shipment.transitFlight,
        currency: shipment.currency,
        depositStatus: shipment.depositStatus,
        lcSd: autoLinkedLc?.lcSd ?? shipment.lcSd,
        salesOwner: shipment.salesOwner,
        exportOwner: shipment.exportOwner,
        salesEmailRecipients: shipment.salesEmailRecipients,
        salesRequest: shipment.salesRequest,
        note: shipment.note,
        emailSent: shipment.emailSent,
        invNo: shipment.invNo,
        releaseDate: fmtDate(shipment.releaseDate),
        etd: fmtDateTimeLocal(shipment.etd),
        eta: fmtDateTimeLocal(shipment.eta),
        invoiceValue: Number(shipment.invoiceValue),
        freightTotal: Number(shipment.freightTotal),
        dispatchNote: shipment.dispatchNote,
        linkedLcId: shipment.linkedLcId ?? autoLinkedLc?.id ?? null,
        products: shipment.products.map((product) => ({
          id: product.id,
          productMasterId: product.productMasterId,
          productName: product.productName,
          costGroupCode: product.costGroupCode,
          factory: product.factory,
          englishName: product.englishName,
          productionRequestNo: product.productionRequestNo,
          piNo: product.piNo,
          lotNo: product.lotNo,
          exportUnitPrice: Number(product.exportUnitPrice),
          bxQtyPaid: product.bxQtyPaid,
          bxQtyFoc: product.bxQtyFoc,
          bxQtyTotal: product.bxQtyTotal,
          amount: Number(product.amount),
          normalBoxQty: product.normalBoxQty,
          iceBoxQty: product.iceBoxQty,
          injectionBoxQty: product.injectionBoxQty,
          commonBoxQty: product.commonBoxQty,
          grossWeight: Number(product.grossWeight),
          changeNote: product.changeNote,
          exportEmailRecipients: product.exportEmailRecipients
        }))
      }}
      options={{
        transport: optionValues(DropdownCategory.TRANSPORT),
        destinationPort: optionValues(DropdownCategory.DESTINATION_PORT),
        storageCondition: optionValues(DropdownCategory.STORAGE_CONDITION),
        incoterms: optionValues(DropdownCategory.INCOTERMS),
        paymentTerm: optionValues(DropdownCategory.PAYMENT_TERM),
        depositStatus: optionValues(DropdownCategory.DEPOSIT_STATUS),
        forwarder: optionValues(DropdownCategory.FORWARDER),
        departurePort: optionValues(DropdownCategory.DEPARTURE_PORT)
      }}
      productMasters={productMasters.map((product) => ({
        id: product.id,
        name: product.name,
        costGroupCode: product.costGroupCode,
        factory: product.factory
      }))}
      shipmentAttachments={attachments.map((file) => ({
        id: file.id,
        ownerId: file.ownerId,
        originalName: file.originalName,
        path: file.path,
        mimeType: file.mimeType
      }))}
      productAttachments={productAttachments.map((file) => ({
        id: file.id,
        ownerId: file.ownerId,
        originalName: file.originalName,
        path: file.path,
        mimeType: file.mimeType
      }))}
      buyerNote={
        buyerMaster
          ? {
              id: buyerMaster.id,
              buyerName: buyerMaster.buyerName,
              specialNote: buyerMaster.specialNote,
              specialNoteUpdatedAt: buyerMaster.specialNoteUpdatedAt?.toISOString() ?? null
            }
          : null
      }
      buyerAttachments={buyerAttachments.map((file) => ({
        id: file.id,
        ownerId: file.ownerId,
        originalName: file.originalName,
        path: file.path,
        mimeType: file.mimeType
      }))}
      lcs={lcs.map((lc) => ({
        id: lc.id,
        lcNo: lc.lcNo,
        productionRequestNo: lc.productionRequestNo,
        lcSd: lc.lcSd,
        buyer: lc.buyer
      }))}
    />
  );
}
