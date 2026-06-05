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

function safeStoredName(fileName: string) {
  const safeName = fileName.normalize("NFC").replace(/[^\p{L}\p{N}._-]+/gu, "_");
  return `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}

export async function saveAttachments(files: File[], ownerType: AttachmentOwnerType, ownerId: string, userId: string) {
  const uploadableFiles = files.filter((file) => file && file.size > 0);
  if (!uploadableFiles.length) return;

  const storage = storageClient();
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
