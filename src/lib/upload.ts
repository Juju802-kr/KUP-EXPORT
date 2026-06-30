import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { AttachmentOwnerType } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const uploadDir = path.join(process.cwd(), "uploads");

function storageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!url || !key || !bucket) return null;
  return { bucket, client: createClient(url, key, { auth: { persistSession: false } }) };
}

function requireWritableStorage() {
  const storage = storageClient();
  if (storage) return storage;
  if (process.env.VERCEL) {
    throw new Error("배포 환경에서 Supabase Storage 설정(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET)이 필요합니다.");
  }
  return null;
}

function fileExtension(fileName: string) {
  const match = fileName.normalize("NFC").match(/(\.[A-Za-z0-9]{1,16})$/);
  return match?.[1]?.toLowerCase() ?? "";
}

/** Supabase Storage keys must stay ASCII-only; keep the original name in the DB. */
function safeStoredName(fileName: string) {
  return `${Date.now()}-${crypto.randomUUID()}${fileExtension(fileName)}`;
}

export async function deleteAttachment(attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw new Error("첨부파일을 찾을 수 없습니다.");

  const storage = storageClient();
  if (storage) {
    const { error } = await storage.client.storage.from(storage.bucket).remove([attachment.storedName]);
    if (error) throw new Error(`파일 삭제 실패: ${error.message}`);
  } else {
    const { unlink } = await import("fs/promises");
    await unlink(path.join(uploadDir, attachment.storedName)).catch(() => undefined);
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  return attachment;
}

export async function saveAttachments(files: File[], ownerType: AttachmentOwnerType, ownerId: string, userId: string) {
  const uploadableFiles = files.filter((file) => file && file.size > 0);
  if (!uploadableFiles.length) return;

  const storage = requireWritableStorage();
  if (!storage) await mkdir(uploadDir, { recursive: true });

  for (const file of uploadableFiles) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const storedName = safeStoredName(file.name);

    if (storage) {
      const { error } = await storage.client.storage.from(storage.bucket).upload(storedName, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });
      if (error) throw new Error(`파일 업로드 실패: ${error.message}`);
    } else {
      await writeFile(path.join(uploadDir, storedName), bytes);
    }

    await prisma.attachment.create({
      data: {
        ownerType,
        ownerId,
        originalName: file.name,
        storedName,
        path: `/uploads/${storedName}`,
        mimeType: file.type,
        size: file.size,
        uploadedById: userId
      }
    });
  }
}
