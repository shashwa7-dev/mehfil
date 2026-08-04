"""Decide whether a video title actually names a given song.

Corroborating the film or the singer is not enough on its own, and assuming
otherwise is what puts the wrong recording behind the right name. "Ab Ke Sajan
Sawan Mein" is from the film *Chupke Chupke*, so an upload of the entirely
different song "Chupke Chupke Chal Re Purbaiya" corroborates on film and scores
as a near-certain match. The song's own name has to appear too.

Three things make that harder than a substring test, none of them errors:

  Script.  Half these uploads title themselves in Devanagari. आधी रोटी सारा
  कबाब is "Aadhi Roti Sara Kabab" and must compare equal to it.

  Romanisation.  There is no agreed spelling. Meharban and Meherbaan, Aashiqui
  and आशिकी (which transliterates with a k), Nain and Nayan. The disagreements
  are overwhelmingly about vowel length and a handful of consonants, so those
  distinctions are folded out of both sides before comparing.

  Truncation.  A video title routinely keeps only the opening words of a long
  song name. "Aaj Unse Pehli Mulaqat" is a correct title for "Aaj Unse Pehli
  Mulaqat Hogi", so a solid prefix counts as present.

What survives all three and still does not match is a genuinely different song.
"""

import difflib
import re

# Rough Devanagari to Latin. Not a transliteration standard — it only has to be
# consistent enough that two spellings of one word land in the same place.
DEVANAGARI = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
    'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l',
    'क़': 'k', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f',
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
    'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
    'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h', 'ृ': 'ri', '्': '', '़': '',
}

# Where two romanisations of the same sound disagree.
FOLD = (
    ('aa', 'a'), ('ee', 'i'), ('oo', 'u'), ('ii', 'i'), ('uu', 'u'),
    ('q', 'k'), ('w', 'v'), ('y', 'i'), ('z', 'j'), ('ph', 'f'),
)

MIN_RATIO = 0.80
# Below this a "prefix" is too short to mean anything.
MIN_PROBE = 10


def fold(text):
    """Comparison key: script-independent and romanisation-independent."""
    folded = ''.join(DEVANAGARI.get(ch, ch) for ch in (text or '')).lower()
    folded = re.sub(r'[^a-z0-9]', '', folded)
    for pattern, replacement in FOLD:
        folded = folded.replace(pattern, replacement)
    # Doubled letters survive both scripts inconsistently.
    return re.sub(r'(.)\1+', r'\1', folded)


def opens_with_song(song_title, video_title, threshold=MIN_RATIO):
    """True when the video title *begins* with the song's name.

    Needed where merely containing the name proves nothing. A title song shares
    its name with its film, so every upload from that film carries it somewhere:
    "Din Jawani Ke Char Yaar - Pyar Kiye Jaa 1966" contains "Pyar Kiye Ja" and is
    a different song, while "Love In Tokyo - Mohammed Rafi" opens with it and is
    the right one. Splitting on separators is not enough — the deciding case has
    none.
    """
    want, hay = fold(song_title), fold(video_title)
    if not want or not hay:
        return False
    head = hay[:len(want)]
    if head == want:
        return True
    return difflib.SequenceMatcher(None, want, head).ratio() >= threshold


def names_song(song_title, video_title, threshold=MIN_RATIO):
    """True when the video title plausibly names this song."""
    want, hay = fold(song_title), fold(video_title)
    if not want or not hay:
        return False

    probes = [want]
    if len(want) > 12:
        probes.append(want[:max(MIN_PROBE, int(len(want) * 0.65))])

    for probe in probes:
        if probe in hay:
            return True
        width = len(probe)
        for start in range(0, max(1, len(hay) - width + 1)):
            window = hay[start:start + width]
            if difflib.SequenceMatcher(None, probe, window).ratio() >= threshold:
                return True
    return False
