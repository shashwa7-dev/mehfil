import type { Metadata } from "next";

// See app/songs/layout.tsx for why metadata lives in a layout rather than the
// page: ReleasesPage is a client component and cannot export it directly.
export const metadata: Metadata = {
  title: "Release notes",
  description:
    "Every version of Mehfil so far — what each one added, and what it " +
    "repaired.",
};

export default function ReleasesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
