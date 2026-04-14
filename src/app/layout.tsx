import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "境界設計室 / Boundary LAB Portal",
  description: "境界を越える体験を設計する",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
