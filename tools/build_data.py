#!/usr/bin/env python3
"""
Builds the app's Bible and lexicon data files in data/ from open sources.

  python3 tools/build_data.py <download-dir>

Sources (downloaded into <download-dir> if missing):
  - KJV 1769 with Strong's numbers (CrossWire KJV module, via scrollmapper/bible_databases). Text public domain; tagging GPL.
  - Reina-Valera 1909 (public domain), Bible David Martin 1744 (public domain), same repository.
  - Strong's Greek and Hebrew dictionaries, Open Scriptures (CC-BY-SA).

Output:
  data/kjv.json    books -> chapters -> verses, with Strong's tags inline: word{G25} or "the world{G3588 G2889}"
  data/rv1909.json, data/martin1744.json   plain text, same shape
  data/strongs.json  number -> [lemma, transliteration, pronunciation, definition, KJV renderings, derivation]
"""
import html.parser
import json
import os
import re
import sys
import urllib.request

SCROLL = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/sources'
STRONGS = 'https://raw.githubusercontent.com/openscriptures/strongs/master'
SOURCES = {
    'KJV-osis.json': f'{SCROLL}/en/KJV/KJV-osis.json',
    'SpaRV.json': f'{SCROLL}/es/SpaRV/SpaRV.json',
    'FreBDM1744.json': f'{SCROLL}/fr/FreBDM1744/FreBDM1744.json',
    'greek.js': f'{STRONGS}/greek/strongs-greek-dictionary.js',
    'hebrew.js': f'{STRONGS}/hebrew/strongs-hebrew-dictionary.js',
}

# Book ids match js/data.js. Canonical Protestant order, 66 books.
BOOK_IDS = ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam '
            'Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php '
            'Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev').split()
BOOK_NAMES = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel',
              '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job',
              'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations',
              'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
              'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
              '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
              '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
              'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation']


def fetch(dirpath, name):
    path = os.path.join(dirpath, name)
    if not os.path.exists(path):
        print('downloading', name)
        urllib.request.urlretrieve(SOURCES[name], path)
    return path


def strong_num(raw):
    m = re.match(r'([GH])0*(\d+)', raw)
    return f'{m.group(1)}{m.group(2)}' if m else None


class OsisVerse(html.parser.HTMLParser):
    """Flattens one OSIS verse to text with {G..}/{H..} tags after each tagged word."""
    # HTMLParser lowercases tag names.
    SKIP = {'note', 'rdg', 'catchword'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.skip = 0
        self.stack = []  # strong numbers of open <w> elements
        self.divine = 0  # inside <divineName>: KJV prints LORD in capitals

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.SKIP:
            self.skip += 1
        elif tag == 'divinename':
            self.divine += 1
        elif tag == 'w':
            nums = [strong_num(x[7:]) for x in (a.get('lemma') or '').split() if x.startswith('strong:')]
            self.stack.append([n for n in nums if n])

    def handle_startendtag(self, tag, attrs):
        pass  # empty <w/> (untranslated article) and milestones carry no text

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip -= 1
        elif tag == 'divinename':
            self.divine -= 1
        elif tag == 'psalmtitle':
            self.out.append(' ')  # Psalm titles run straight into verse 1 otherwise
        elif tag == 'w' and self.stack:
            nums = self.stack.pop()
            if nums and not self.skip and self.out and self.out[-1].strip():
                self.out.append('{' + ' '.join(nums) + '}')

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data.upper() if self.divine else data)

    def text(self):
        t = ''.join(self.out)
        return re.sub(r'\s+', ' ', t).strip()


def tagged(raw):
    p = OsisVerse()
    # Python's HTMLParser reads <title> as raw text, so rename it before parsing.
    p.feed(re.sub(r'<(/?)title\b', r'<\1psalmtitle', raw))
    p.close()
    return p.text()


def build_version(src, out, meta, convert):
    data = json.load(open(src, encoding='utf-8'))
    books = []
    for i, b in enumerate(data['books'][:66]):
        chapters = []
        for c in b['chapters']:
            verses = [convert(v['text']) for v in c['verses']]
            chapters.append(verses)
        books.append({'id': BOOK_IDS[i], 'name': BOOK_NAMES[i], 'localName': b['name'].strip(),
                      'testament': 'OT' if i < 39 else 'NT', 'chapters': chapters})
    json.dump({**meta, 'books': books}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')


def load_js_dict(path):
    s = open(path, encoding='utf-8').read()
    start = s.index('= {') + 2
    end = s.rindex('};') + 1
    return json.loads(s[start:end])


def build_strongs(greek, hebrew, out):
    lex = {}
    for num, e in load_js_dict(greek).items():
        lex[num] = [e.get('lemma', ''), e.get('translit', ''), '', (e.get('strongs_def') or '').strip(),
                    (e.get('kjv_def') or '').strip(), (e.get('derivation') or '').strip()]
    for num, e in load_js_dict(hebrew).items():
        lex[num] = [e.get('lemma', ''), e.get('xlit', ''), e.get('pron', ''), (e.get('strongs_def') or '').strip(),
                    (e.get('kjv_def') or '').strip(), (e.get('derivation') or '').strip()]
    # One source entry (H7578) carries a stray U+FFFD; drop it.
    lex = {k: [f.replace('\ufffd', '').strip() for f in v] for k, v in lex.items()}
    json.dump(lex, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('wrote', out, os.path.getsize(out) // 1024, 'KB', len(lex), 'entries')


def main():
    dl = sys.argv[1] if len(sys.argv) > 1 else 'downloads'
    os.makedirs(dl, exist_ok=True)
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
    os.makedirs(root, exist_ok=True)
    plain = lambda t: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', t)).strip()

    build_version(fetch(dl, 'KJV-osis.json'), os.path.join(root, 'kjv.json'),
                  {'id': 'kjv', 'abbrev': 'KJV', 'name': 'King James Version (1769) with Strong’s numbers',
                   'language': 'en', 'license': 'Text public domain; Strong’s tagging from CrossWire (GPL)'}, tagged)
    build_version(fetch(dl, 'SpaRV.json'), os.path.join(root, 'rv1909.json'),
                  {'id': 'rv1909', 'abbrev': 'RV1909', 'name': 'Reina-Valera 1909', 'language': 'es',
                   'license': 'Public domain'}, plain)
    build_version(fetch(dl, 'FreBDM1744.json'), os.path.join(root, 'martin1744.json'),
                  {'id': 'martin1744', 'abbrev': 'Martin', 'name': 'Bible David Martin (1744)', 'language': 'fr',
                   'license': 'Public domain'}, plain)
    build_strongs(fetch(dl, 'greek.js'), fetch(dl, 'hebrew.js'), os.path.join(root, 'strongs.json'))


if __name__ == '__main__':
    main()
