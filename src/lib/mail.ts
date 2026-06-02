import { sendProgramEmail } from "@/lib/email-program";

export async function sendOrLogEmail(input: {
  to: string[];
  subject: string;
  body: string;
  createdById?: string;
}) {
  await sendProgramEmail(input);
}
