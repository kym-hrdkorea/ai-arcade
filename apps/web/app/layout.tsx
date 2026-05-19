import type { Metadata } from "next";
import localFont from "next/font/local";

import "../styles/globals.css";

const arcadeFont = localFont({
  src: "./fonts/press-start-2p.ttf",
  weight: "400",
  variable: "--font-arcade-pixel",
});

const bodyFont = localFont({
  src: [
    {
      path: "./fonts/noto-sans-kr-400.ttf",
      weight: "400",
    },
    {
      path: "./fonts/noto-sans-kr-900.ttf",
      weight: "900",
    },
  ],
  variable: "--font-body-korean",
});

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
      <body className={`${arcadeFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
