import { SkipLink } from "@/components/navigation/SkipLink";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = { themeColor: "#040f13", colorScheme: "dark" };

export const metadata: Metadata = {
  title: "Aegisyn AI — Sonar Threat Intelligence Platform",
  description: "AI-Powered Network Intrusion Detection & Threat Intelligence. Detect the unseen.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#071013] text-[#EAF4F0] flex flex-col font-sans select-none">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
