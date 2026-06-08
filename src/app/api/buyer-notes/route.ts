import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveAttachments } from "@/lib/upload";
import { formString } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const buyerId = formString(formData, "buyerId");
  const shipmentId = formString(formData, "shipmentId");
  if (!buyerId) return NextResponse.json({ error: "바이어 정보를 찾을 수 없습니다." }, { status: 400 });

  await prisma.buyerMaster.update({
    where: { id: buyerId },
    data: {
      specialNote: formString(formData, "specialNote"),
      specialNoteUpdatedAt: new Date(),
      updatedById: user.id
    }
  });
  await saveAttachments(formData.getAll("files").filter((file): file is File => file instanceof File), "BUYER_MASTER", buyerId, user.id);
  if (shipmentId) revalidatePath(`/shipments/${shipmentId}`);

  return NextResponse.json({ ok: true });
}
