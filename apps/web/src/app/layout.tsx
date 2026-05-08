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

const title = "FrameFind — On-device Computer Vision SDK for the Web";
const description =
  "Modular, privacy-first face detectors running fully local in the browser and Node.js via ONNX. Glasses, head pose, blink, attention, gaze, emotion — zero backend, zero tracking.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "FrameFind",
  authors: [{ name: "Jorge Mora" }],
  creator: "Jorge Mora",
  keywords: [
    "computer vision",
    "face detection",
    "on-device ML",
    "ONNX",
    "WebGPU",
    "WASM",
    "glasses detection",
    "head pose",
    "privacy-first",
    "React SDK",
    "browser ML",
  ],
  metadataBase: new URL(siteUrl),
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "FrameFind",
    images: [
      {
        url: "/og_image.png",
        width: 1200,
        height: 630,
        alt: "FrameFind — On-device Computer Vision SDK",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og_image.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "FrameFind",
      url: siteUrl,
      logo: `${siteUrl}/og_image.png`,
    },
    {
      "@type": "SoftwareApplication",
      name: "FrameFind SDK",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      description:
        "Modular, privacy-first face detectors running fully local in the browser and Node.js via ONNX.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      url: siteUrl,
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
