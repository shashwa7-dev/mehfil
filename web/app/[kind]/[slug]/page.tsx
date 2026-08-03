import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CollectionView } from "@/components/collection-view";
import { KIND_BY_FACET, slugify } from "@/lib/routes";

/**
 * Server shell for the collection routes.
 *
 * Exists purely so `generateStaticParams` can prerender every collection.
 * Without it these routes render per request, which Turbopack's dev server
 * cannot do for this dependency graph — it throws "require is not defined"
 * and every station, artist and film 500s locally.
 *
 * Prerendering is also the honest fit: the pages are client-rendered from a
 * cached catalogue, so a server render produces nothing a static shell does
 * not already give.
 */
export function generateStaticParams() {
  // The exported catalogue is the source of truth for what exists.
  const catalogue = JSON.parse(
    readFileSync(join(process.cwd(), "public", "catalogue.json"), "utf-8")
  ) as { facets: Record<string, string[]> };

  const params: { kind: string; slug: string }[] = [];
  const seen = new Set<string>();

  for (const [facet, kind] of Object.entries(KIND_BY_FACET)) {
    for (const label of catalogue.facets[facet] ?? []) {
      const slug = slugify(label);
      // Slugs are lossy, so two labels can collapse to one route. The view
      // resolves to the first match either way; a duplicate param would just
      // fail the build.
      const key = `${kind}/${slug}`;
      if (!slug || seen.has(key)) continue;
      seen.add(key);
      params.push({ kind, slug });
    }
  }
  return params;
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ kind: string; slug: string }>;
}) {
  const { kind, slug } = await params;
  return <CollectionView kind={kind} slug={slug} />;
}
