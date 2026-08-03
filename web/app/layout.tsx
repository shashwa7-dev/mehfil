import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Figtree: a geometric sans in the same family as the faces music apps favour.
// Spotify's own Circular is proprietary, and of the free alternatives Figtree
// is the one actually drawn for interfaces — Poppins and Outfit read well large
// but get wide and loose in dense track rows.
//
// One face at several weights rather than a display/body pair: geometric sans
// carry headings on weight and tracking alone, and mixing a serif in would
// undo the look this is going for.
const figtree = Figtree({
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
      className={`dark ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
