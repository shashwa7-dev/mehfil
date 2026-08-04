/**
 * Shape of what people send us about a song, shared by the form and the route
 * that receives it.
 *
 * Two things get reported, and they are the two the pipeline cannot judge for
 * itself. A wrong track passes every automated check — right title, right film,
 * right credits, plausible length, plays fine — and is simply not the recording
 * anyone means; only a listener knows. A missing song is one the resolver could
 * not find, which is usually a search-phrasing problem rather than an absence.
 *
 * Both are far more useful with a link than without, so the form asks for one
 * and the id is extracted here rather than left as free text to be untangled
 * later.
 */

export type ReportKind = "wrong-track" | "missing-song";

export type Report = {
  kind: ReportKind;
  songId: number;
  songTitle: string;
  songFilm?: string;
  /** What is playing now, for a wrong-track report. */
  currentVideoId?: string;
  /** The link they suggest, as typed. */
  suggestedUrl?: string;
  note?: string;
};

/**
 * Pull the video id out of whatever form of YouTube link was pasted.
 *
 * People paste what the share button gives them, which carries playlist and
 * radio parameters — the link in a report of this kind is typically
 * `watch?v=ID&list=RDID&start_radio=1`. Storing the whole thing means untangling
 * it by hand later, so it is reduced to the id at the point of entry, where it
 * can also be checked.
 */
export function youtubeId(input: string): string | null {
  const url = (input || "").trim();
  if (!url) return null;

  // A bare id, pasted without the surrounding link.
  if (/^[\w-]{11}$/.test(url)) return url;

  const patterns = [
    /[?&]v=([\w-]{11})/,        // watch?v=ID
    /youtu\.be\/([\w-]{11})/,   // youtu.be/ID
    /\/embed\/([\w-]{11})/,     // /embed/ID
    /\/shorts\/([\w-]{11})/,    // /shorts/ID
    /\/live\/([\w-]{11})/,      // /live/ID
  ];
  for (const pattern of patterns) {
    const found = url.match(pattern);
    if (found) return found[1];
  }
  return null;
}

/** Human-readable reason a report cannot be sent, or null if it can. */
export function validateReport(report: Report): string | null {
  if (!report.songTitle?.trim()) return "Missing song.";
  if (report.kind === "missing-song" && !report.suggestedUrl?.trim()) {
    return "Please paste a YouTube link.";
  }
  if (report.suggestedUrl?.trim() && !youtubeId(report.suggestedUrl)) {
    return "That does not look like a YouTube link.";
  }
  if ((report.note?.length ?? 0) > 500) return "Note is too long.";
  return null;
}

/** Send a report. Resolves to an error message, or null when it went through. */
export async function sendReport(
  report: Report,
  /** Honeypot: a real person never fills this in, a bot fills in everything. */
  trap = ""
): Promise<string | null> {
  const invalid = validateReport(report);
  if (invalid) return invalid;

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...report, trap }),
    });
    if (response.ok) return null;
    const body = await response.json().catch(() => ({}));
    return body.error || `Could not send (${response.status}).`;
  } catch {
    return "Could not reach the server. Please try again.";
  }
}
