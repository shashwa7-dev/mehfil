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
        {/* App-wide backdrop.

            A video rather than the GIF it came from. A GIF is decoded on the
            CPU and re-decoded every loop; the same footage as h264 is smaller
            and decodes in hardware, which matters when a YouTube player is
            already running. The still beside it is both the poster and what
            anyone who has asked for reduced motion gets instead.

            Fixed and behind everything, so it holds still while content
            scrolls over it. 22% here, because the content area lays bg-card/40
            over it and takes 40% of whatever this sets — the previous backdrop
            was set at 7% and arrived under the threshold of visible. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/backdrop.jpg"
            className="absolute inset-0 size-full object-cover opacity-[0.22] motion-reduce:hidden"
          >
            <source src="/backdrop.mp4" type="video/mp4" />
          </video>
          {/* Shown only when motion is unwanted; the video is hidden then. */}
          <img
            src="/backdrop.jpg"
            alt=""
            className="absolute inset-0 hidden size-full object-cover opacity-[0.22] motion-reduce:block"
          />

          {/* Warm wash, so the backdrop belongs to the brass palette rather
              than merely sitting under it. */}
          <div className="absolute inset-0 bg-[oklch(0.79_0.135_78)]/[0.07]" />

          {/* Only the bottom, and gently. A gradient from the top would undo
              the opacity chosen above. */}
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
