import type { MetadataRoute } from "next";

/**
 * PWA manifest. Replaces the generator's placeholder ("MyWebSite", white
 * theme), which would have shown the wrong name on an installed icon and
 * flashed a white splash before the dark UI painted.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mehfil — Retro Bollywood Songs",
    short_name: "Mehfil",
    description:
      "Browse and play golden-era Hindi film music by singer, composer, lyricist, film and mood.",
    start_url: "/",
    display: "standalone",
    // Matched to the app shell so the splash screen does not flash white.
    background_color: "#1a1613",
    theme_color: "#1a1613",
    orientation: "any",
    categories: ["music", "entertainment"],
    icons: [
      // "any" and "maskable" are listed separately: Android crops maskable
      // icons to its own shape, which would cut into the badge's border if it
      // were the only entry.
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
