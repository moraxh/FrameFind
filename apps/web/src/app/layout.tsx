import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next"
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const siteUrl = "https://framefind.vercel.app";

export const metadata: Metadata = {
  title: "FrameFind | Real-time On-device Glasses Detection",
  description:
    "Real-time computer vision library that detects whether a person is wearing glasses using facial landmarks and a lightweight ONNX model.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "FrameFind | Real-time On-device Glasses Detection",
    description:
      "Real-time computer vision library that detects whether a person is wearing glasses using facial landmarks and a lightweight ONNX model.",
    url: siteUrl,
    siteName: "FrameFind",
    images: [
      {
        url: "/og_image.png",
        width: 1200,
        height: 630,
        alt: "FrameFind SDK",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FrameFind | Real-time On-device Glasses Detection",
    description:
      "Real-time computer vision library that detects whether a person is wearing glasses using facial landmarks and a lightweight ONNX model.",
    images: ["/og_image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body
        className="font-sans bg-[#0a0a0a] text-neutral-300 antialiased selection:bg-cyan-500/30 selection:text-cyan-200"
        suppressHydrationWarning
      >
        {children}
      </body>
      <Analytics />
    </html>
  );
}
