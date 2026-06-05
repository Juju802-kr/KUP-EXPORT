import type { Metadata } from "next";
import { SubmitFeedback } from "@/components/SubmitFeedback";
import "./globals.css";

export const preferredRegion = "icn1";

export const metadata: Metadata = {
  title: "Shipping Agent",
  description: "Internal shipping workflow MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SubmitFeedback />
        {children}
      </body>
    </html>
  );
}
