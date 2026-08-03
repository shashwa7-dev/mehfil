import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// Fraunces for display: an old-style serif with real warmth, which suits a
// golden-era catalogue far better than a neutral grotesque. `opsz` lets it
// pick up finer detail at the large sizes headings actually render at.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

// Inter for the interface: dense track rows need a face that stays legible at
// 12-13px, and its tabular figures keep timecodes from shifting as they count.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mehfil",
  description: "Browse and play golden-era Hindi film music by singer, composer, lyricist, film and mood.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
