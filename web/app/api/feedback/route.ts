import { NextResponse } from "next/server";
import { youtubeId, type ReportKind } from "@/lib/feedback";

/**
 * Receives song reports and forwards them to the sheet.
 *
 * The forwarding happens here rather than from the browser so the webhook URL
 * stays on the server. An Apps Script web app is unauthenticated by design —
 * anyone holding the URL can append rows — so shipping it in client JavaScript
 * would be publishing a write endpoint to the sheet. Kept here, the only way in
 * is through this route, and the checks below apply to everyone.
 *
 * The reports themselves are worth collecting because they are the one thing
 * the pipeline cannot work out alone. A wrong track satisfies every automated
 * check: right title, right film, right credits, plausible length, plays
 * cleanly, and still the wrong recording. Only somebody who knows the song can
 * say so.
 */

// Runs on the Node runtime for a plain outbound fetch with no edge constraints.
export const runtime = "nodejs";
// Nothing here is cacheable, and a cached POST would silently drop reports.
export const dynamic = "force-dynamic";

const WEBHOOK = process.env.FEEDBACK_WEBHOOK_URL;

const MAX_NOTE = 500;
const MAX_TITLE = 200;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;

/**
 * Per-address rate limit, held in memory.
 *
 * Deliberately modest. It resets when the instance recycles and is not shared
 * between them, so it will not stop a determined flood — that is what the
 * sheet's own history is for. What it does stop is the accidental case: a
 * double-clicked button, a retry loop, one person submitting the same thing
 * twenty times. Anything stronger means a store, which is a lot of apparatus
 * for a form on a personal project.
 */
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // Stop the map growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [address, times] of hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(address);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // Honeypot. A person cannot fill a field they cannot see; a bot filling the
  // form by name fills this one too. Answered with success so that whatever
  // submitted it has no signal to adapt to.
  if (clean(body.trap, 100)) {
    return NextResponse.json({ ok: true });
  }

  const kind = body.kind as ReportKind;
  if (kind !== "wrong-track" && kind !== "missing-song") {
    return NextResponse.json({ error: "Unknown report type." }, { status: 400 });
  }

  const songTitle = clean(body.songTitle, MAX_TITLE);
  if (!songTitle) {
    return NextResponse.json({ error: "Missing song." }, { status: 400 });
  }

  const suggestedUrl = clean(body.suggestedUrl, 500);
  const suggestedVideoId = suggestedUrl ? youtubeId(suggestedUrl) : null;
  if (suggestedUrl && !suggestedVideoId) {
    return NextResponse.json(
      { error: "That does not look like a YouTube link." },
      { status: 400 }
    );
  }
  if (kind === "missing-song" && !suggestedVideoId) {
    return NextResponse.json(
      { error: "Please paste a YouTube link." },
      { status: 400 }
    );
  }

  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(address)) {
    return NextResponse.json(
      { error: "Too many reports just now. Please try again in a minute." },
      { status: 429 }
    );
  }

  const row = {
    at: new Date().toISOString(),
    kind,
    songId: Number.isFinite(body.songId) ? body.songId : "",
    songTitle,
    songFilm: clean(body.songFilm, MAX_TITLE),
    currentVideoId: clean(body.currentVideoId, 20),
    // Both the id and what was pasted: the id is what the pipeline consumes,
    // and the original is what makes a mis-parse obvious rather than invisible.
    suggestedVideoId: suggestedVideoId ?? "",
    suggestedUrl,
    note: clean(body.note, MAX_NOTE),
    reporterName: clean(body.reporterName, 60),
    userAgent: clean(request.headers.get("user-agent"), 200),
  };

  if (!WEBHOOK) {
    // Without somewhere to put it, saying "sent" would be a lie. Logged so the
    // report is at least recoverable from the deployment logs.
    console.warn("[feedback] FEEDBACK_WEBHOOK_URL is not set. Report:", row);
    return NextResponse.json(
      { error: "Reporting is not configured yet. Nothing was lost — please try later." },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[feedback] webhook rejected", response.status, row);
      return NextResponse.json(
        { error: "Could not record that just now. Please try again." },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("[feedback] webhook unreachable", error, row);
    return NextResponse.json(
      { error: "Could not record that just now. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
