import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design system",
  description:
    "The tokens, type and components Mehfil is built from — a brass palette " +
    "in OKLCH, Figtree, and shadcn on Base UI.",
};

/**
 * What the app is made of, for anyone who wants to know.
 *
 * Every value here is read from the real source — globals.css, layout.tsx,
 * package.json — rather than described from memory. A page that documents a
 * design system and then drifts from it is worse than no page, so the swatches
 * carry the actual token names and anyone can check them.
 */

const PALETTE = [
  { token: "--primary", value: "oklch(0.79 0.135 78)", name: "Brass", note: "Accents, the play button, everything that means yes" },
  { token: "--heart", value: "oklch(0.70 0.17 22)", name: "Heart", note: "Favourites only. Warm red at the brass's own lightness" },
  { token: "--background", value: "oklch(0.145 0 0)", name: "Ground", note: "The room the whole app sits in" },
  { token: "--card", value: "oklch(0.205 0 0)", name: "Card", note: "Panels and dialogs" },
  { token: "--sidebar", value: "oklch(0.115 0.005 60)", name: "Sidebar", note: "Darker than the ground, so the rail recedes" },
  { token: "--muted-foreground", value: "oklch(0.72 0.012 70)", name: "Muted", note: "Second-line text: singers, counts, dates" },
  { token: "--border", value: "oklch(1 0 0 / 9%)", name: "Border", note: "White at nine per cent, never a grey" },
];

const PRIMITIVES = [
  "alert-dialog", "badge", "button", "card", "input", "scroll-area",
  "select", "separator", "sheet", "skeleton", "slider", "toggle", "tooltip",
];

export default function DesignPage() {
  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-3xl leading-tight">Design system</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Mehfil is one dark theme, one accent, and a small set of primitives.
          There is no light mode and no second brand colour, which is less a
          principle than an admission: a catalogue of golden-era film music
          wants brass on near-black, and everything else was a distraction.
        </p>
      </header>

      <Section
        title="Colour"
        lead="Every colour is a CSS custom property in OKLCH, never a hex literal in a class string. OKLCH because its lightness is perceptual — the accent and the heart sit at 0.79 and 0.70, and they read as siblings rather than one shouting over the other."
      >
        <ul className="space-y-2">
          {PALETTE.map((swatch) => (
            <li
              key={swatch.token}
              className="flex items-center gap-3 rounded-lg border border-white/[0.07] p-2.5"
            >
              <span
                aria-hidden
                className="size-9 shrink-0 rounded-md ring-1 ring-white/10"
                style={{ background: swatch.value }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{swatch.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {swatch.note}
                </span>
              </span>
              <code className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:block">
                {swatch.token}
              </code>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Type"
        lead="Figtree, at one weight range, for everything. It was chosen for the company it keeps: the faces music apps favour are geometric sans, Spotify's own Circular is proprietary, and Figtree is the free one that sits nearest without imitating."
      >
        <div className="space-y-3 rounded-lg border border-white/[0.07] p-4">
          <p className="text-3xl leading-tight">Aa Dil Se Dil Mila Le</p>
          <p className="text-lg leading-snug">Asha Bhosle · Navrang · 1959</p>
          <p className="text-sm text-muted-foreground">
            Body text sits at 14px with relaxed leading. Second-line detail is
            muted rather than smaller, so a song row stays two readable lines
            instead of one readable and one squinted at.
          </p>
        </div>
      </Section>

      <Section
        title="Breakpoints"
        lead="The one genuinely unusual thing here. Tailwind's breakpoints ask about width; ours ask about height too."
      >
        <div className="overflow-x-auto rounded-lg border border-white/[0.07]">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-white/[0.07]">
                <th className="px-3 py-2 font-medium">Variant</th>
                <th className="px-3 py-2 font-medium">Applies when</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {[
                ["sm", "width ≥ 40rem and height ≥ 30rem"],
                ["md", "width ≥ 48rem and height ≥ 30rem"],
                ["lg", "width ≥ 64rem and height ≥ 30rem"],
              ].map(([name, rule]) => (
                <tr key={name} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-3 py-2 text-foreground">{name}:</td>
                  <td className="px-3 py-2 text-muted-foreground">{rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          A phone turned sideways is 844px wide and 390px tall. Judged on width
          alone it looks like a tablet, so the app used to rearrange itself into
          a layout meant for a much taller window. Width was standing in for
          &ldquo;what kind of device is this&rdquo;, and rotating a phone changes
          the width without changing the answer.
        </p>
      </Section>

      <Section
        title="Components"
        lead="shadcn/ui, but on Base UI rather than Radix — that is the part worth knowing if you are reading the source expecting asChild and finding render props instead."
      >
        <div className="flex flex-wrap gap-1.5">
          {PRIMITIVES.map((name) => (
            <code
              key={name}
              className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-xs text-muted-foreground"
            >
              {name}
            </code>
          ))}
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Thirteen primitives, and everything else is composed in the app rather
          than installed. Lists are virtualised with react-virtuoso, because
          3,916 rows is more than a browser will draw happily. Icons are lucide,
          at one size per context.
        </p>
      </Section>

      <Section
        title="Idioms"
        lead="Conventions the codebase keeps to, more useful to know than any single component."
      >
        <ul className="space-y-3">
          {[
            ["Edges fade rather than stop.", "Artwork, overflowing titles and the backdrop all end in a mask gradient instead of a hard line. The same trick appears on the player bar, the song details wash and the welcome card."],
            ["Motion is opt-out everywhere.", "Every animation is behind motion-safe:, and the backdrops ship a still alongside the video for anyone who has asked for less movement."],
            ["Colour never carries meaning alone.", "Toggles that show state in the accent also set aria-pressed; emphasised text is <strong> before it is coloured."],
            ["Tokens, not literals.", "A hex in a class string is where a palette starts drifting, so colours resolve through custom properties and shadows quote the token's own value."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-lg border border-white/[0.07] p-4">
              <p className="text-sm">{title}</p>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg leading-snug">{title}</h2>
      <p className="mb-4 mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {lead}
      </p>
      {children}
    </section>
  );
}
