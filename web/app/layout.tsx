import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { Providers } from "./providers";
import { PlayerProvider } from "@/components/player-provider";
import { OfflineNotice } from "@/components/offline-notice";
import { AppFrame } from "@/components/app-frame";
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

/**
 * Absolute origin for the metadata. Every share card depends on getting this
 * right: og:image is emitted as an absolute URL, so when this falls back to
 * localhost the crawler is handed an address on its own machine, fetches
 * nothing, and renders a card with no image. The card looks broken while the
 * image route it points at is perfectly healthy.
 *
 * Vercel already knows the answer, so it is read from there rather than
 * requiring a variable to be set by hand and remembered on every project:
 *
 *   NEXT_PUBLIC_SITE_URL          an explicit override, if one is ever wanted
 *   VERCEL_PROJECT_PRODUCTION_URL the project's production domain, custom
 *                                 domain included — used even on previews, so
 *                                 a shared preview link still shows the real
 *                                 card rather than a deployment-specific one
 *   VERCEL_URL                    this deployment, before a production domain
 *                                 exists
 */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

const SITE_URL = siteUrl();
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
  // iOS ignores the manifest's display mode and reads these instead, so
  // without them an installed app opens in a Safari chrome rather than
  // standalone. black-translucent lets the dark shell run under the status
  // bar, which is what the theme colour is for everywhere else.
  appleWebApp: {
    capable: true,
    title: "Mehfil",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Next emits the standardised `mobile-web-app-capable`, which Safari does
    // not read. The Apple-prefixed name is deprecated everywhere else and is
    // still the one iOS acts on, so both are present.
    "apple-mobile-web-app-capable": "yes",
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
        {/* App-wide backdrop. A still, not the video it was taken from: a
            looping 4K decode would run behind everything and compete with the
            player for the same frame budget, which is the contention the
            expanded view's blur was already reduced for.

            Fixed, so it stays put while content scrolls over it, and behind
            everything at -z-10. Graded warm and soft before shipping — the
            source is a cold grey alpine scene and this palette is brass on
            warm dark, so ungraded it would pull the whole app grey. At 7% it
            gives the surface some depth without becoming a picture. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <img
            src="/backdrop.jpg"
            alt=""
            className="size-full object-cover opacity-[0.18]"
          />
          {/* Only the bottom, and gently. The previous gradient ran from the
              top at 40% and 80%, which — on top of the 18% here and the
              bg-card/40 the content area lays over all of it — left a lift of
              well under two levels out of 255. Three reductions multiplied
              into nothing. */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/70 to-transparent" />
        </div>
        {/* PlayerProvider sits in the layout, not a page: layouts persist
            across navigation, so the YouTube iframe — and the music — survive
            moving between browse, a station and the full song list. */}
        <Providers>
          <PlayerProvider>
            <AppFrame>{children}</AppFrame>
            <OfflineNotice />
          </PlayerProvider>
        </Providers>
      </body>
    </html>
  );
}
