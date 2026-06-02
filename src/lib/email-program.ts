import nodemailer from "nodemailer";
import { Team } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ProgramEmailInput = {
  to: string[];
  subject: string;
  body: string;
  createdById?: string;
  html?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function linkifyPlainText(body: string) {
  const escaped = escapeHtml(body);
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const cleanUrl = url.replace(/[.)\],;:]+$/g, "");
    const trailing = url.slice(cleanUrl.length);
    return `<a href="${cleanUrl}" style="color:#2563eb;text-decoration:underline;">${cleanUrl}</a>${trailing}`;
  });
  return `<div style="font-family:Arial,'Malgun Gothic',sans-serif;font-size:14px;line-height:1.6;color:#111;">${linked.replace(/\r?\n/g, "<br>")}</div>`;
}

function smtpConfig() {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
  const host = process.env.SMTP_HOST || (user ? "smtp.gmail.com" : "");
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM || user || "";
  if (!host || !user || !pass || !from) return null;
  return { host, port, user, pass, from };
}

export async function sendProgramEmail(input: ProgramEmailInput) {
  const recipients = [...new Set(input.to.map((value) => value.trim()).filter(Boolean))];
  const receiverList = recipients.join(", ");
  const mailBody = input.html ? input.body : linkifyPlainText(input.body);

  if (!recipients.length) {
    await prisma.emailLog.create({
      data: {
        to: "",
        subject: input.subject,
        body: input.body,
        status: "NO_RECIPIENT",
        createdById: input.createdById
      }
    });
    return { sent: 0, failed: 0, total: 0 };
  }

  const config = smtpConfig();
  if (!config) {
    await prisma.emailLog.create({
      data: {
        to: receiverList,
        subject: input.subject,
        body: input.body,
        status: "LOGGED_NO_SMTP",
        createdById: input.createdById
      }
    });
    return { sent: 0, failed: recipients.length, total: recipients.length };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass }
    });
    await transporter.sendMail({
      from: config.from,
      to: receiverList,
      subject: input.subject,
      html: mailBody
    });
    await prisma.emailLog.create({
      data: {
        to: receiverList,
        subject: input.subject,
        body: input.body,
        status: "SENT_SMTP",
        createdById: input.createdById
      }
    });
    return { sent: recipients.length, failed: 0, total: recipients.length };
  } catch (error) {
    await prisma.emailLog.create({
      data: {
        to: receiverList,
        subject: input.subject,
        body: input.body,
        status: "FAILED_SMTP",
        error: error instanceof Error ? error.message : "Unknown SMTP error",
        createdById: input.createdById
      }
    });
    return { sent: 0, failed: recipients.length, total: recipients.length };
  }
}

export async function resolveRecipientEmails(values: Array<string | null | undefined>, teams?: Team[]) {
  const raw = values
    .flatMap((value) => String(value ?? "").split(/[;,]/))
    .map((value) => value.trim())
    .filter(Boolean);
  const emails = raw.filter((value) => value.includes("@"));
  const names = raw.filter((value) => !value.includes("@"));
  if (names.length) {
    const users = await prisma.user.findMany({
      where: { name: { in: names }, ...(teams ? { team: { in: teams } } : {}) },
      select: { email: true }
    });
    emails.push(...users.map((user) => user.email));
  }
  return [...new Set(emails)];
}
