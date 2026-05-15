import type { Metadata } from "next";

import "../styles/globals.css";

export const metadata: Metadata = {
  title: "AI Arcade",
  description: "AI와 사람이 함께 즐기는 레트로 게임 허브",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
