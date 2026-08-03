"""Fetch real portraits for the catalogue's people from Wikidata / Wikimedia Commons.

Song thumbnails are a poor stand-in for a person, and Commons is the right
source: openly licensed, stable, and with an API that lets us confirm we have
the right individual before trusting a photo.

Identity is verified rather than assumed. A name search alone happily returns a
different person with the same name, so a candidate is accepted only if
Wikidata says it is a human (P31=Q5) whose occupations (P106) include a musical
role. Anything unverified is skipped, leaving the UI to fall back to song art.

Images are downloaded locally rather than hot-linked, which is what Wikimedia
asks for, and each one's licence and author are recorded so attribution is
possible.

    python3 pipeline/fetch_artist_photos.py data/carvaan.db web/public/artists
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store

UA = {"User-Agent": "CarvaanPersonalProject/1.0 (personal, local use)"}
API = "https://www.wikidata.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
THUMB_WIDTH = 400

HUMAN = "Q5"
# Musical occupations. A name match that is not one of these is the wrong person.
MUSIC_ROLES = {
    "Q177220",   # singer
    "Q1415090",  # playback singer
    "Q639669",   # musician
    "Q36834",    # composer
    "Q486748",   # songwriter
    "Q158852",   # conductor
    "Q3282637",  # film producer (Lata et al. wear several hats)
    "Q753110",   # songwriter/lyricist
    "Q49757",    # poet (lyricists)
    "Q214917",   # playwright
    "Q33999",    # actor (on-screen faces)
    "Q2526255",  # film director
    "Q10800557", # film actor
}
# Roles that alone are not enough to call someone a musician.
WEAK_ROLES = {"Q33999", "Q10800557", "Q2526255", "Q3282637", "Q214917"}


def get_json(url, retries=3):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=25
            ) as response:
                return json.load(response)
        except Exception:
            if attempt == retries - 1:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def name_key(name):
    """Fold a name for comparison: lowercase, letters and digits only.

    Keeps "R.D. Burman" == "R. D. Burman" while still separating "Anand" from
    "Anand Bakshi".
    """
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def names_match(query, labels):
    """True only when the entity is actually called what we searched for.

    Wikidata search is fuzzy: "Abhas" returns Kishore Kumar (whose birth name
    was Abhas Kumar Ganguly) and "Benny" returns Benny Andersson of ABBA.
    Occupation checks do not catch either, because both are real musicians.
    Requiring the name itself to match is what rejects them.
    """
    target = name_key(query)
    return any(name_key(label) == target for label in labels)


class LookupFailed(Exception):
    """The API did not answer. Distinct from 'this person has no photo'.

    Conflating the two is how a momentary rate-limit permanently blacklists
    someone: the null gets cached in the manifest and never retried.
    """


def find_person(name):
    """Return (qid, image_filename) for a verified musical human, else None.

    Raises LookupFailed if the API could not be reached, so the caller can
    leave the person out of the manifest and retry on the next run.
    """
    query = urllib.parse.quote(name)
    found = get_json(
        f"{API}?action=wbsearchentities&search={query}&language=en&format=json&limit=5"
    )
    if found is None:
        raise LookupFailed(name)
    if not found.get("search"):
        return None

    ids = [hit["id"] for hit in found["search"]]
    entities = get_json(
        f"{API}?action=wbgetentities&ids={'|'.join(ids)}"
        f"&props=claims|labels|aliases&languages=en&format=json"
    )
    if entities is None:
        raise LookupFailed(name)
    if "entities" not in entities:
        raise LookupFailed(name)

    for qid in ids:  # search order is relevance order
        entity = entities.get("entities", {}).get(qid, {})
        claims = entity.get("claims", {})

        # The entity must actually bear this name, not merely be a fuzzy hit.
        labels = [entity.get("labels", {}).get("en", {}).get("value", "")]
        labels += [a["value"] for a in entity.get("aliases", {}).get("en", [])]
        if not names_match(name, labels):
            continue

        instances = {
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in claims.get("P31", [])
            if "datavalue" in c["mainsnak"]
        }
        if HUMAN not in instances:
            continue

        roles = {
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in claims.get("P106", [])
            if "datavalue" in c["mainsnak"]
        }
        # Require at least one role, and not only the weak ones.
        if not (roles & MUSIC_ROLES) or not (roles - WEAK_ROLES) and not (
            roles & {"Q177220", "Q1415090", "Q639669", "Q36834"}
        ):
            continue

        images = claims.get("P18", [])
        if not images or "datavalue" not in images[0]["mainsnak"]:
            continue
        return qid, images[0]["mainsnak"]["datavalue"]["value"]

    return None


def image_meta(filename):
    """Thumbnail URL plus licence and author, straight from Commons."""
    title = urllib.parse.quote(f"File:{filename}")
    data = get_json(
        f"{COMMONS}?action=query&titles={title}&prop=imageinfo"
        f"&iiprop=url|extmetadata&iiurlwidth={THUMB_WIDTH}&format=json"
    )
    if not data:
        return None
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        if not info:
            continue
        extra = info.get("extmetadata", {})
        return {
            "url": info.get("thumburl") or info.get("url"),
            "license": (extra.get("LicenseShortName", {}) or {}).get("value", "unknown"),
            "author": re.sub(
                r"<[^>]+>", "", (extra.get("Artist", {}) or {}).get("value", "")
            ).strip()[:120],
            "descriptionurl": info.get("descriptionurl", ""),
        }
    return None


def download(url, path):
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers=UA), timeout=40
        ) as response:
            data = response.read()
        if len(data) < 1000:  # a stub or error page, not a real image
            return False
        with open(path, "wb") as fh:
            fh.write(data)
        return True
    except Exception:
        return False


def main(db_path, out_dir):
    conn = store.connect(db_path)
    os.makedirs(out_dir, exist_ok=True)
    manifest_path = os.path.join(out_dir, "manifest.json")

    manifest = {}
    if os.path.exists(manifest_path):
        manifest = json.load(open(manifest_path, encoding="utf-8"))

    # People worth a portrait: credited singers, plus the roles the browse grid
    # shows as circular cards.
    people = {}
    for row in conn.execute(
        "SELECT a.name, COUNT(*) n FROM song_artists sa "
        "JOIN artists a ON a.id = sa.artist_id "
        "JOIN resolutions r ON r.song_id = sa.song_id AND r.embeddable = 1 "
        "GROUP BY a.name ORDER BY n DESC"
    ):
        people[row["name"]] = row["n"]
    for row in conn.execute(
        "SELECT person, COUNT(DISTINCT sr.song_id) n FROM song_roles sr "
        "JOIN resolutions r ON r.song_id = sr.song_id AND r.embeddable = 1 "
        "GROUP BY person ORDER BY n DESC"
    ):
        people.setdefault(row["person"], row["n"])

    todo = [n for n in people if n not in manifest]
    print(f"{len(people)} people, {len(manifest)} already done, {len(todo)} to fetch\n")

    hit = miss = 0
    for i, name in enumerate(todo, start=1):
        slug = slugify(name)
        path = os.path.join(out_dir, f"{slug}.jpg")

        try:
            result = find_person(name)
        except LookupFailed:
            # Leave absent from the manifest so the next run retries.
            miss += 1
            continue

        if result:
            qid, filename = result
            meta = image_meta(filename)
            if meta and meta["url"] and download(meta["url"], path):
                manifest[name] = {
                    "file": f"{slug}.jpg",
                    "qid": qid,
                    "license": meta["license"],
                    "author": meta["author"],
                    "source": meta["descriptionurl"],
                }
                hit += 1
            else:
                manifest[name] = None
                miss += 1
        else:
            manifest[name] = None
            miss += 1

        # Persist as we go so an interrupt never re-fetches what is already done.
        if i % 10 == 0 or i == len(todo):
            with open(manifest_path, "w", encoding="utf-8") as fh:
                json.dump(manifest, fh, ensure_ascii=False, indent=1)
            print(f"  {i}/{len(todo)}  photos={hit}  none={miss}", flush=True)
        time.sleep(0.15)  # be polite to the Wikimedia APIs

    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)

    have = sum(1 for v in manifest.values() if v)
    print(f"\nportraits: {have} / {len(manifest)} people")
    print(f"-> {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
