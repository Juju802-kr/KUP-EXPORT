import { z } from "zod";

export const emailSchema = z.string().email("이메일 형식이 올바르지 않습니다.").endsWith("@kup.co.kr", {
  message: "@kup.co.kr 이메일만 가입할 수 있습니다."
});

export const requiredText = (label: string) => z.string().trim().min(1, `${label}을(를) 입력해주세요.`);

export function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formNumber(formData: FormData, key: string) {
  const value = formString(formData, key).replaceAll(",", "");
  return value ? Number(value) : 0;
}

export function formDate(formData: FormData, key: string) {
  const value = formString(formData, key);
  if (!value) return null;
  return new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

export function formUploadFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((entry): entry is File => entry instanceof File && entry.size > 0);
}
