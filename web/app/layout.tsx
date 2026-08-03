import type { Metadata, Viewport } from "next";
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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const DESCRIPTION =
  "Browse and play golden-era Hindi film music by singer, composer, lyricist, " +
  "actor, film and mood. Over 3,000 songs across 66 stations.";

export const metadata: Metadata = {
  // Without metadataBase, Next emits relative og:image URLs, which crawlers
  // cannot resolve — the card renders with no image at all.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Mehfil — Retro Bollywood Songs",
    template: "%s · Mehfil",
  },
  description: DESCRIPTION,
  applicationName: "Mehfil",
  keywords: [
    "retro bollywood songs",
    "old hindi songs",
    "golden era hindi music",
    "Lata Mangeshkar",
    "Mohammed Rafi",
    "Kishore Kumar",
    "R.D. Burman",
    "carvaan",
  ],
  openGraph: {
    type: "website",
    siteName: "Mehfil",
    title: "Mehfil — Retro Bollywood Songs",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
  },
  twitter: {
    // summary_large_image gives the full-width card; plain "summary" crops to
    // a small square and wastes the artwork.
    card: "summary_large_image",
    title: "Mehfil — Retro Bollywood Songs",
    description: DESCRIPTION,
  },
  // WhatsApp, Slack and iMessage read the OpenGraph tags above; no separate
  // markup is needed for them.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Tints the browser chrome on mobile to match the shell.
  themeColor: "#1a1613",
  colorScheme: "dark",
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
