/*
 * Data layer. Everything the app reads comes through BSData, and every
 * content source is a "module" registered with a type. New translations,
 * lexicons or commentaries are added by registering another module; the
 * screens never touch module internals.
 *
 * Module types: bible, lexicon, commentary, crossref, dictionary.
 * Licenses: "public-domain" (bundled) or "paid-addon" (locked until licensed).
 *
 * Bible verse text marks Strong's numbers inline: word{G26}. The tag belongs
 * to the word directly before it.
 *
 * Everything below is SAMPLE data for the prototype: a few dozen KJV verses
 * and a handful of lexicon entries. Commentary entries are placeholder
 * summaries, not quotations from the named works.
 */
(function () {
  const modules = {};

  const BOOKS = [
    { id: 'Gen', name: 'Genesis', aliases: ['genesis', 'gen', 'gn'] },
    { id: 'Deu', name: 'Deuteronomy', aliases: ['deuteronomy', 'deut', 'deu', 'dt'] },
    { id: 'Psa', name: 'Psalms', aliases: ['psalms', 'psalm', 'psa', 'ps'] },
    { id: 'Jhn', name: 'John', aliases: ['john', 'jn', 'jhn'] },
    { id: 'Rom', name: 'Romans', aliases: ['romans', 'rom', 'rm'] },
    { id: '1Co', name: '1 Corinthians', aliases: ['1 corinthians', '1corinthians', '1 cor', '1cor', 'first corinthians'] },
    { id: 'Heb', name: 'Hebrews', aliases: ['hebrews', 'heb'] },
    { id: '1Jn', name: '1 John', aliases: ['1 john', '1john', '1 jn', '1jn', 'first john'] },
  ];

  function registerModule(mod) {
    modules[mod.id] = mod;
  }

  function listModules(type) {
    return Object.values(modules).filter(m => !type || m.type === type);
  }

  function getModule(id) {
    return modules[id] || null;
  }

  /* ---------- references ---------- */

  function bookById(id) {
    return BOOKS.find(b => b.id === id);
  }

  function refKey(book, ch, v) {
    return `${book}.${ch}.${v}`;
  }

  function formatRef(key) {
    const [b, c, v] = key.split('.');
    const book = bookById(b);
    return `${book ? book.name : b} ${c}:${v}`;
  }

  // "John 3:16", "1 John 4 8", "romans 5.8"
  function parseRef(text) {
    const m = String(text).trim().toLowerCase()
      .match(/^((?:[123]|first|second|third)?\s*[a-z]+)\.?\s+(\d+)\s*[:.\s]\s*(\d+)/);
    if (!m) return null;
    const name = m[1].replace(/\s+/g, ' ').trim();
    const book = BOOKS.find(b => b.aliases.includes(name) || b.aliases.includes(name.replace(' ', '')));
    if (!book) return null;
    return refKey(book.id, +m[2], +m[3]);
  }

  /* ---------- verse text ---------- */

  const TAG_RE = /([^\s{}]+?)\{([GH]\d+)\}/g;

  function plainText(tagged) {
    return tagged.replace(/\{[GH]\d+\}/g, '');
  }

  // Splits tagged text into [{text, strongs?}] tokens for rendering.
  function tokens(tagged) {
    const out = [];
    let last = 0;
    tagged.replace(TAG_RE, (match, word, num, idx) => {
      if (idx > last) out.push({ text: tagged.slice(last, idx) });
      out.push({ text: word, strongs: num });
      last = idx + match.length;
    });
    if (last < tagged.length) out.push({ text: tagged.slice(last) });
    return out;
  }

  function bible(versionId) {
    const m = modules[versionId];
    if (m && m.type === 'bible' && m.installed) return m;
    return modules.kjv; // locked or unknown versions fall back to the core text
  }

  function getVerse(key, versionId = 'kjv') {
    const m = bible(versionId);
    const raw = m.verses[key];
    if (raw == null) return null;
    return { key, ref: formatRef(key), tagged: raw, text: plainText(raw), version: m.abbrev };
  }

  function chapters(versionId = 'kjv') {
    const m = bible(versionId);
    const map = new Map();
    Object.keys(m.verses).forEach(k => {
      const [b, c] = k.split('.');
      if (!map.has(b)) map.set(b, new Set());
      map.get(b).add(+c);
    });
    return BOOKS.filter(b => map.has(b.id)).map(b => ({ book: b, chapters: [...map.get(b.id)].sort((x, y) => x - y) }));
  }

  function chapterVerses(book, ch, versionId = 'kjv') {
    const m = bible(versionId);
    return Object.keys(m.verses)
      .filter(k => { const [b, c] = k.split('.'); return b === book && +c === ch; })
      .sort((a, z) => +a.split('.')[2] - +z.split('.')[2])
      .map(k => getVerse(k, versionId));
  }

  function allVerses(versionId = 'kjv') {
    const m = bible(versionId);
    const order = BOOKS.map(b => b.id);
    return Object.keys(m.verses)
      .sort((a, z) => {
        const [ab, ac, av] = a.split('.'); const [zb, zc, zv] = z.split('.');
        return order.indexOf(ab) - order.indexOf(zb) || ac - zc || av - zv;
      })
      .map(k => getVerse(k, versionId));
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Exact-word occurrences ("love" does not count "loved").
  function countWord(word, versionId = 'kjv') {
    const re = new RegExp(`\\b${escapeRe(word)}\\b`, 'gi');
    let total = 0;
    const verses = [];
    allVerses(versionId).forEach(v => {
      const n = (v.text.match(re) || []).length;
      if (n) { total += n; verses.push(v); }
    });
    return { total, verses };
  }

  // Verses containing the word or a form starting with it (love, loved, loveth).
  function searchVerses(query, versionId = 'kjv') {
    const q = query.trim();
    if (!q) return [];
    const re = new RegExp(`\\b${escapeRe(q)}`, 'i');
    return allVerses(versionId).filter(v => re.test(v.text));
  }

  /* ---------- Strong's ---------- */

  function lexiconEntry(num) {
    for (const m of listModules('lexicon')) {
      if (m.entries[num]) return { num, language: num[0] === 'G' ? 'Greek' : 'Hebrew', ...m.entries[num] };
    }
    return null;
  }

  function lexiconEntries() {
    return listModules('lexicon').flatMap(m => Object.keys(m.entries)).map(lexiconEntry)
      .sort((a, b) => a.num[0].localeCompare(b.num[0]) || +a.num.slice(1) - +b.num.slice(1));
  }

  // Every verse that uses a Strong's number, with the English word KJV used there.
  function occurrences(num) {
    const out = [];
    allVerses('kjv').forEach(v => {
      const words = tokens(v.tagged).filter(t => t.strongs === num).map(t => t.text);
      if (words.length) out.push({ verse: v, words });
    });
    return out;
  }

  // Which original-language words sit behind an English word, e.g. love -> G26, G25, H157.
  function originalsFor(word, language) {
    const w = word.toLowerCase();
    const found = new Map();
    allVerses('kjv').forEach(v => {
      tokens(v.tagged).forEach(t => {
        if (!t.strongs) return;
        if (language && (language === 'greek') !== (t.strongs[0] === 'G')) return;
        const tw = t.text.toLowerCase().replace(/[^a-z']/g, '');
        if (tw === w || (tw.startsWith(w) && tw.length - w.length <= 3)) {
          const f = found.get(t.strongs) || { entry: lexiconEntry(t.strongs), forms: new Set(), verses: new Set() };
          f.forms.add(tw);
          f.verses.add(v.key);
          found.set(t.strongs, f);
        }
      });
    });
    return [...found.values()].filter(f => f.entry)
      .map(f => ({ entry: f.entry, forms: [...f.forms], verseCount: f.verses.size }));
  }

  function searchLexicon(query) {
    const q = query.trim().toLowerCase();
    if (!q) return lexiconEntries();
    return lexiconEntries().filter(e =>
      e.num.toLowerCase() === q ||
      e.translit.toLowerCase().includes(q) ||
      e.lemma.includes(query.trim()) ||
      e.kjv.some(r => r.toLowerCase().startsWith(q)) ||
      e.definition.toLowerCase().includes(q));
  }

  /* ---------- commentary, cross-refs, dictionary ---------- */

  function commentaries(key) {
    return listModules('commentary').filter(m => m.installed).flatMap(m =>
      (m.entries[key] ? [{ source: m.name, short: m.abbrev, text: m.entries[key] }] : []));
  }

  function crossRefs(key) {
    const out = [];
    listModules('crossref').forEach(m => (m.refs[key] || []).forEach(r =>
      out.push({ key: r, ref: formatRef(r), verse: getVerse(r), source: m.name })));
    return out;
  }

  function define(word) {
    const w = word.toLowerCase();
    const dict = listModules('dictionary').flatMap(m =>
      Object.entries(m.entries).filter(([k]) => k.toLowerCase() === w).map(([k, text]) => ({ source: m.name, term: k, text })));
    const lex = lexiconEntries().filter(e => e.kjv.some(r => r.toLowerCase() === w || r.toLowerCase().startsWith(w + ' ')));
    return { dict, lex };
  }

  window.BSData = {
    BOOKS, registerModule, listModules, getModule, bookById, refKey, formatRef, parseRef,
    tokens, plainText, getVerse, chapters, chapterVerses, allVerses, countWord, searchVerses,
    lexiconEntry, lexiconEntries, occurrences, originalsFor, searchLexicon,
    commentaries, crossRefs, define,
  };
})();

/* ================= SAMPLE MODULES ================= */

BSData.registerModule({
  id: 'kjv', type: 'bible', abbrev: 'KJV', name: 'King James Version (with Strong’s)',
  language: 'en', license: 'public-domain', installed: true,
  verses: {
    'Gen.1.1': 'In the beginning{H7225} God{H430} created{H1254} the heaven{H8064} and the earth{H776}.',
    'Gen.1.2': 'And the earth{H776} was without form, and void; and darkness{H2822} was upon the face of the deep. And the Spirit{H7307} of God{H430} moved upon the face of the waters.',
    'Gen.1.3': 'And God{H430} said, Let there be light{H216}: and there was light{H216}.',
    'Deu.6.4': 'Hear, O Israel: The LORD{H3068} our God{H430} is one LORD{H3068}:',
    'Deu.6.5': 'And thou shalt love{H157} the LORD{H3068} thy God{H430} with all thine heart{H3824}, and with all thy soul{H5315}, and with all thy might.',
    'Psa.23.1': 'The LORD{H3068} is my shepherd{H7462}; I shall not want.',
    'Psa.23.2': 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
    'Psa.23.3': 'He restoreth my soul{H5315}: he leadeth me in the paths of righteousness for his name’s sake.',
    'Psa.23.4': 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.',
    'Jhn.1.1': 'In the beginning{G746} was the Word{G3056}, and the Word{G3056} was with God{G2316}, and the Word{G3056} was God{G2316}.',
    'Jhn.1.2': 'The same was in the beginning{G746} with God{G2316}.',
    'Jhn.1.3': 'All things were made by him; and without him was not any thing made that was made.',
    'Jhn.1.4': 'In him was life{G2222}; and the life{G2222} was the light{G5457} of men.',
    'Jhn.1.5': 'And the light{G5457} shineth in darkness{G4653}; and the darkness{G4653} comprehended it not.',
    'Jhn.3.16': 'For God{G2316} so loved{G25} the world{G2889}, that he gave his only begotten{G3439} Son{G5207}, that whosoever believeth{G4100} in him should not perish{G622}, but have everlasting{G166} life{G2222}.',
    'Jhn.3.17': 'For God{G2316} sent not his Son{G5207} into the world{G2889} to condemn the world{G2889}; but that the world{G2889} through him might be saved.',
    'Jhn.15.13': 'Greater love{G26} hath no man than this, that a man lay down his life for his friends.',
    'Rom.5.8': 'But God{G2316} commendeth his love{G26} toward us, in that, while we were yet sinners{G268}, Christ{G5547} died for us.',
    'Rom.8.38': 'For I am persuaded, that neither death, nor life{G2222}, nor angels, nor principalities, nor powers, nor things present, nor things to come,',
    'Rom.8.39': 'Nor height, nor depth, nor any other creature, shall be able to separate us from the love{G26} of God{G2316}, which is in Christ{G5547} Jesus our Lord.',
    '1Co.13.4': 'Charity{G26} suffereth long, and is kind; charity{G26} envieth not; charity{G26} vaunteth not itself, is not puffed up,',
    '1Co.13.13': 'And now abideth faith{G4102}, hope{G1680}, charity{G26}, these three; but the greatest of these is charity{G26}.',
    'Heb.11.3': 'Through faith{G4102} we understand that the worlds were framed by the word of God{G2316}, so that things which are seen were not made of things which do appear.',
    '1Jn.4.8': 'He that loveth{G25} not knoweth not God{G2316}; for God{G2316} is love{G26}.',
    '1Jn.4.9': 'In this was manifested the love{G26} of God{G2316} toward us, because that God{G2316} sent his only begotten{G3439} Son{G5207} into the world{G2889}, that we might live through him.',
    '1Jn.4.10': 'Herein is love{G26}, not that we loved{G25} God{G2316}, but that he loved{G25} us, and sent his Son{G5207} to be the propitiation{G2434} for our sins{G266}.',
  },
});

// Licensed translations: registered so the version button can cycle them, but locked.
['ESV', 'NASB', 'NIV'].forEach(abbrev => BSData.registerModule({
  id: abbrev.toLowerCase(), type: 'bible', abbrev, name: abbrev, language: 'en',
  license: 'paid-addon', installed: false, verses: {},
}));

BSData.registerModule({
  id: 'strongs', type: 'lexicon', name: 'Strong’s Hebrew and Greek (sample)', license: 'public-domain', installed: true,
  entries: {
    G25: { lemma: 'ἀγαπάω', translit: 'agapaō', pron: 'ag-ap-ah’-o', definition: 'to love (in a social or moral sense).', kjv: ['love', 'loved', 'loveth', 'beloved'] },
    G26: { lemma: 'ἀγάπη', translit: 'agapē', pron: 'ag-ah’-pay', definition: 'love, i.e. affection or benevolence; specially (plural) a love-feast.', kjv: ['love', 'charity', 'dear', 'feast of charity'] },
    G166: { lemma: 'αἰώνιος', translit: 'aiōnios', pron: 'ahee-o’-nee-os', definition: 'perpetual (also used of past time, or past and future as well).', kjv: ['eternal', 'everlasting', 'for ever'] },
    G266: { lemma: 'ἁμαρτία', translit: 'hamartia', pron: 'ham-ar-tee’-ah', definition: 'a sin (properly abstract); offence.', kjv: ['sin', 'sins', 'sinful', 'offence'] },
    G268: { lemma: 'ἁμαρτωλός', translit: 'hamartōlos', pron: 'ham-ar-to-los’', definition: 'sinful, i.e. a sinner.', kjv: ['sinner', 'sinners', 'sinful'] },
    G622: { lemma: 'ἀπόλλυμι', translit: 'apollymi', pron: 'ap-ol’-loo-mee', definition: 'to destroy fully; to perish, or lose.', kjv: ['destroy', 'die', 'lose', 'perish'] },
    G746: { lemma: 'ἀρχή', translit: 'archē', pron: 'ar-khay’', definition: 'a commencement, or (concretely) chief (in various applications of order, time, place, or rank).', kjv: ['beginning', 'corner', 'first', 'principality', 'rule'] },
    G1680: { lemma: 'ἐλπίς', translit: 'elpis', pron: 'el-pece’', definition: 'expectation (abstractly or concretely) or confidence.', kjv: ['faith', 'hope'] },
    G2316: { lemma: 'θεός', translit: 'theos', pron: 'theh’-os', definition: 'a deity, especially the supreme Divinity.', kjv: ['God', 'god', 'godly'] },
    G2222: { lemma: 'ζωή', translit: 'zōē', pron: 'dzo-ay’', definition: 'life.', kjv: ['life', 'lifetime'] },
    G2434: { lemma: 'ἱλασμός', translit: 'hilasmos', pron: 'hil-as-mos’', definition: 'atonement, i.e. (concretely) an expiator.', kjv: ['propitiation'] },
    G2889: { lemma: 'κόσμος', translit: 'kosmos', pron: 'kos’-mos', definition: 'orderly arrangement; by implication the world (in a wide or narrow sense).', kjv: ['adorning', 'world'] },
    G3056: { lemma: 'λόγος', translit: 'logos', pron: 'log’-os', definition: 'something said (including the thought); by implication a topic, reasoning or motive; in John, the Divine Expression (Christ).', kjv: ['word', 'Word', 'saying', 'account', 'speech'] },
    G3439: { lemma: 'μονογενής', translit: 'monogenēs', pron: 'mon-og-en-ace’', definition: 'only-born, i.e. sole.', kjv: ['only begotten', 'only child'] },
    G4100: { lemma: 'πιστεύω', translit: 'pisteuō', pron: 'pist-yoo’-o', definition: 'to have faith (in, upon, or with respect to); by implication to entrust.', kjv: ['believe', 'believeth', 'commit to trust'] },
    G4102: { lemma: 'πίστις', translit: 'pistis', pron: 'pis’-tis', definition: 'persuasion, i.e. credence; moral conviction; reliance upon Christ for salvation.', kjv: ['faith', 'assurance', 'belief'] },
    G4653: { lemma: 'σκοτία', translit: 'skotia', pron: 'skot-ee’-ah', definition: 'dimness, obscurity.', kjv: ['dark', 'darkness'] },
    G5207: { lemma: 'υἱός', translit: 'huios', pron: 'hwee-os’', definition: 'a son (used very widely of immediate, remote or figurative kinship).', kjv: ['son', 'Son', 'child'] },
    G5457: { lemma: 'φῶς', translit: 'phōs', pron: 'foce', definition: 'luminousness (in the widest application, natural or artificial).', kjv: ['fire', 'light'] },
    G5547: { lemma: 'Χριστός', translit: 'Christos', pron: 'khris-tos’', definition: 'anointed, i.e. the Messiah, an epithet of Jesus.', kjv: ['Christ'] },
    H157: { lemma: 'אָהַב', translit: '’ahab', pron: 'aw-hab’', definition: 'to have affection for (sexually or otherwise).', kjv: ['love', 'beloved', 'friend', 'lover'] },
    H216: { lemma: 'אוֹר', translit: '’owr', pron: 'ore', definition: 'illumination or (concretely) luminary (in every sense).', kjv: ['light', 'bright', 'day', 'morning', 'sun'] },
    H430: { lemma: 'אֱלֹהִים', translit: '’elohiym', pron: 'el-o-heem’', definition: 'gods in the ordinary sense; but specifically used (in the plural thus) of the supreme God.', kjv: ['God', 'god', 'judges', 'mighty'] },
    H776: { lemma: 'אֶרֶץ', translit: '’erets', pron: 'eh’-rets', definition: 'the earth (at large, or partitively a land).', kjv: ['earth', 'land', 'country', 'ground', 'world'] },
    H1254: { lemma: 'בָּרָא', translit: 'bara’', pron: 'baw-raw’', definition: 'to create; (qualified) to cut down (a wood), select, feed (as formative processes).', kjv: ['create', 'creator', 'make'] },
    H2822: { lemma: 'חֹשֶׁךְ', translit: 'choshek', pron: 'kho-shek’', definition: 'the dark; hence (literally) darkness; figuratively misery, destruction, death, ignorance, sorrow, wickedness.', kjv: ['dark', 'darkness', 'night', 'obscurity'] },
    H3068: { lemma: 'יְהֹוָה', translit: 'Yehovah', pron: 'yeh-ho-vaw’', definition: '(the) self-Existent or Eternal; Jehovah, Jewish national name of God.', kjv: ['LORD', 'Jehovah', 'the Lord'] },
    H3824: { lemma: 'לֵבָב', translit: 'lebab', pron: 'lay-bawb’', definition: 'the heart (as the most interior organ); used also like lev.', kjv: ['heart', 'consider', 'mind', 'understanding'] },
    H5315: { lemma: 'נֶפֶשׁ', translit: 'nephesh', pron: 'neh’-fesh', definition: 'properly a breathing creature, i.e. animal or (abstractly) vitality.', kjv: ['soul', 'life', 'person', 'mind', 'heart'] },
    H7225: { lemma: 'רֵאשִׁית', translit: 're’shiyth', pron: 'ray-sheeth’', definition: 'the first, in place, time, order or rank (specifically a firstfruit).', kjv: ['beginning', 'chief', 'first', 'firstfruits'] },
    H7307: { lemma: 'רוּחַ', translit: 'ruwach', pron: 'roo’-akh', definition: 'wind; by resemblance breath; figuratively life, anger; by extension a spirit.', kjv: ['spirit', 'Spirit', 'wind', 'breath', 'mind'] },
    H7462: { lemma: 'רָעָה', translit: 'ra‘ah', pron: 'raw-aw’', definition: 'to tend a flock, i.e. pasture it; generally to rule.', kjv: ['shepherd', 'feed', 'pastor', 'herdman', 'keep'] },
    H8064: { lemma: 'שָׁמַיִם', translit: 'shamayim', pron: 'shaw-mah’-yim', definition: 'the sky (as aloft; the dual perhaps alluding to the visible arch).', kjv: ['heaven', 'heavens', 'air'] },
  },
});

// Commentary placeholders. Each summary stands in for the real public-domain text.
const PH = '[Placeholder summary. The full public-domain text loads from this module.] ';

BSData.registerModule({
  id: 'mhc', type: 'commentary', abbrev: 'MHC', name: 'Matthew Henry', license: 'public-domain', installed: true,
  entries: {
    'Jhn.3.16': PH + 'Treats the verse as the heart of the gospel: the gift of the Son as the measure of God’s love, offered to all who believe, with eternal life set against perishing.',
    'Jhn.1.1': PH + 'Reads “the Word” as the eternal Son, present with the Father before creation and himself divine.',
    'Rom.5.8': PH + 'Draws out the contrast between human love, given to the worthy, and God’s love, shown to sinners and enemies.',
    'Psa.23.1': PH + 'Applies the shepherd image to God’s daily care and provision for his people.',
    '1Jn.4.8': PH + 'Argues that a loveless life shows no real knowledge of God, since love is his nature.',
  },
});

BSData.registerModule({
  id: 'barnes', type: 'commentary', abbrev: 'Barnes', name: 'Barnes’ Notes', license: 'public-domain', installed: true,
  entries: {
    'Jhn.3.16': PH + 'Notes the word “so” as expressing degree, and comments on the scope of “the world” and “whosoever.”',
    'Jhn.1.1': PH + 'Discusses the background of the term logos and why John chose it for Christ.',
    '1Co.13.4': PH + 'Explains why the KJV renders agapē as “charity” here and lists the marks of love in the passage.',
  },
});

BSData.registerModule({
  id: 'clarke', type: 'commentary', abbrev: 'Clarke', name: 'Adam Clarke', license: 'public-domain', installed: true,
  entries: {
    'Jhn.3.16': PH + 'Comments on “only begotten” and the universality of the offer of salvation.',
    'Gen.1.1': PH + 'Discusses the Hebrew bara and elohim and the plural form of the divine name.',
  },
});

BSData.registerModule({
  id: 'jfb', type: 'commentary', abbrev: 'JFB', name: 'Jamieson, Fausset & Brown', license: 'public-domain', installed: true,
  entries: {
    'Rom.5.8': PH + 'Highlights “commendeth” as God setting his love in its proper light by the death of Christ.',
  },
});

BSData.registerModule({
  id: 'pulpit', type: 'commentary', abbrev: 'Pulpit', name: 'Pulpit Commentary', license: 'public-domain', installed: false, entries: {},
});

BSData.registerModule({
  id: 'tsk', type: 'crossref', name: 'Treasury of Scripture Knowledge (sample)', license: 'public-domain', installed: true,
  refs: {
    'Jhn.3.16': ['Rom.5.8', '1Jn.4.9', '1Jn.4.10', 'Jhn.3.17'],
    'Jhn.3.17': ['Jhn.3.16', '1Jn.4.9'],
    'Jhn.1.1': ['Gen.1.1', 'Jhn.1.2', 'Heb.11.3'],
    'Jhn.1.4': ['Jhn.1.5', 'Gen.1.3'],
    'Gen.1.1': ['Jhn.1.1', 'Jhn.1.3', 'Heb.11.3'],
    'Gen.1.3': ['Jhn.1.4', 'Jhn.1.5'],
    'Rom.5.8': ['Jhn.3.16', 'Jhn.15.13', '1Jn.4.10'],
    '1Jn.4.8': ['1Jn.4.9', '1Jn.4.10', '1Co.13.4'],
    '1Jn.4.9': ['Jhn.3.16', 'Rom.5.8'],
    '1Jn.4.10': ['Rom.5.8', 'Jhn.3.16'],
    'Jhn.15.13': ['Rom.5.8', '1Jn.4.10'],
    'Rom.8.39': ['Rom.5.8', 'Jhn.3.16'],
    'Deu.6.5': ['Deu.6.4', '1Jn.4.8'],
    'Psa.23.1': ['Psa.23.4'],
    '1Co.13.13': ['1Co.13.4', '1Jn.4.8'],
  },
});

BSData.registerModule({
  id: 'smith', type: 'dictionary', name: 'Smith’s Bible Dictionary (sample)', license: 'public-domain', installed: true,
  entries: {
    Shepherd: '[Placeholder entry.] Covers the shepherd’s work in Palestine and the use of the figure for God and for leaders of his people.',
    Propitiation: '[Placeholder entry.] Covers the idea of atonement and the mercy seat.',
    Charity: '[Placeholder entry.] Notes that in the KJV “charity” means love, not almsgiving.',
    Word: '[Placeholder entry.] Covers the Logos title as used by John.',
  },
});
