import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shipping Agent",
  description: "Internal shipping workflow MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
