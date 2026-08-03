# Mehfil

*Mehfil* — an evening gathering for music and poetry.

A personal, local web player for browsing golden-era Hindi film music by singer,
composer, lyricist, actor, film, station and mood. The catalogue is built from
Saregama's publicly published Carvaan Gold songlist.

The device is a *dial*: 66 fixed positions, one axis, pick one. This is a *query
engine*: the same catalogue with composable filters, so
`Gulzar lyrics + R.D. Burman music + Lata vocals` is one click.

> Personal project, run locally. No audio is stored or redistributed — playback
> streams from YouTube's official embeds, and the catalogue holds only factual
> metadata (titles, film names, credits).

## How it works

Saregama publish the Carvaan Gold songlist as a public PDF. That PDF is parsed
into a catalogue, each song is matched to an official YouTube upload, every
match is verified as actually embeddable, and the result is exported as a static
JSON the web app reads.

```
songlist.pdf → parse → enrich → resolve → verify → export → web app
```

### The station trick

Song entries credit only singers. But the 66 stations imply the other roles: a
song under `GULZAR` was written by him, under `R.D. BURMAN` composed by him,
under `REKHA` picturised on her. That back-fills roles the per-song data never
contains — 2,671 songs gain a composer, 2,535 a lyricist, 997 an actor.

## Pipeline

Each stage is independently runnable, idempotent, and resumable. All state lives
in one SQLite file; every write is an UPSERT and no stage deletes resolved rows,
so an interrupted run only ever loses the in-flight batch.

```bash
# 1. Parse the songlist PDF (column-aware: naive extraction bleeds columns)
pdftotext -bbox-layout songlist.pdf full.xml
python3 pipeline/parse_songlist.py full.xml data/songs.json

# 2. Load catalogue + station role taxonomy into SQLite
python3 -c "import sys; sys.path.insert(0,'pipeline'); import store; \
  store.ingest_catalogue(store.connect('data/carvaan.db'), \
  'data/songs.json','data/stations.json')"

# 3. Resolve YouTube ids — three sources, cheapest first
python3 pipeline/import_labnol.py <labnol_dir> data/carvaan.db   # community data
python3 pipeline/harvest_youtube.py data/carvaan.db              # channel listings
python3 pipeline/match_videos.py data/carvaan.db
python3 pipeline/search_youtube.py data/carvaan.db               # per-song search

# 4. Verify every id is actually playable in an iframe
python3 pipeline/verify_embeddable.py data/carvaan.db

# 5. Portraits from Wikidata / Wikimedia Commons
python3 pipeline/fetch_artist_photos.py data/carvaan.db web/public/artists

# 6. Export the static catalogue the app reads
python3 pipeline/export_catalogue.py data/carvaan.db web/public/catalogue.json

# Durability tests
python3 pipeline/test_resume.py
```

## Web app

```bash
cd web && npm install && npm run dev
```

Next.js 16, React 19, Tailwind v4, shadcn/ui (Base UI). Fully static — no
backend, no accounts. Cover art comes from YouTube stills, so no images are
stored for songs.

## Design notes

**A wrong link is worse than a missing one.** A wrong id plays the wrong song
while looking correct. So a title match alone is never enough — the film name or
a credited singer must independently corroborate it, and covers, recreations and
compilations are rejected outright. Coverage was deliberately traded for
precision: an early matcher accepting title-only matches produced ~380 wrong
songs and was scrapped.

**Matched ≠ playable.** Community data from 2017-18 matched 1,871 songs, but
only 52% were still embeddable. Every id is verified against YouTube's oEmbed
endpoint; failures are demoted back to the queue rather than deleted, and dead
ids are remembered so later runs never rediscover them.

**Identity is verified, not assumed.** A name search returns the wrong person
happily. Portraits are accepted only when Wikidata confirms a human (`P31=Q5`)
with a musical occupation (`P106`); otherwise the card falls back to song art.

### Known limits

- **~30% of the catalogue has no playable link.** Obscure titles and
  instrumentals largely aren't on YouTube in embeddable form.
- **Matches at 0.82 confidence (singer-only) are ~1 in 6 questionable.** They
  are flagged in the UI rather than hidden. This needs human ears, not a better
  heuristic.
- **Region restrictions aren't detected.** A video can be embeddable and still
  fail to play in a given country.
- The parsed catalogue holds 4,310 songs against a marketing figure of 5,000 —
  the PDF is *Songlist 1.0* and the shipped device likely carries more.

## Attribution

Artist portraits come from Wikimedia Commons under open licences (CC BY,
CC BY-SA, GODL-India). Per-image licence, author and source URL are recorded in
`web/public/artists/manifest.json`.

Song metadata is factual catalogue data from Saregama's own published songlist.
Playback is via YouTube's official embed player; no audio is downloaded, hosted
or redistributed.
