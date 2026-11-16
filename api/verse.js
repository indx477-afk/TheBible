// GET /api/verse?book=JHN&chapter=3&tr=asv -> verses of one chapter
// GET /api/verse?q=lift you up&tr=asv      -> word/phrase search ("quotes" for exact phrase)
const fs = require('fs');
const L = require('./_lib');

const indexes = {}; // parsed XML kept in memory while the function instance is warm

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
   .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

function loadIndex(tr) {
  if (indexes[tr]) return indexes[tr];
  if (!L.hasDataFile(tr)) return null;
  const xml = fs.readFileSync(L.dataFile(tr), 'utf8');
  const rows = [];
  let b = 0, c = 0;
  const re = /<BIBLEBOOK[^>]*bnumber="(\d+)"|<CHAPTER[^>]*cnumber="(\d+)"|<VERS[^>]*vnumber="(\d+)"[^>]*>([\s\S]*?)<\/VERS>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1]) b = +m[1];
    else if (m[2]) c = +m[2];
    else rows.push([b, c, +m[3], decode(m[4].replace(/<[^>]+>/g, '')).trim()]);
  }
  if (!rows.length) throw new Error('Could not read any verses from the data file.');
  return (indexes[tr] = rows);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function searchBible(q, tr) {
  const terms = [];
  for (const m of q.matchAll(/"([^"]+)"|(\S+)/gu)) {
    const t = (m[1] || m[2] || '').trim();
    if ([...t].length >= 2) terms.push(t);
  }
  const uniq = [...new Set(terms)].slice(0, 6);
  if (!uniq.length) return { code: 400, body: { error: 'Type a word of at least two letters.' } };

  const used = L.hasDataFile(tr) ? tr : L.DEFAULT_TR;
  const rows = loadIndex(used);
  if (!rows) throw new Error('Search needs the ASV text file in the data folder.');
  const note = used !== tr ? tr.toUpperCase() + ' is not set up for search, so these matches come from ' + used.toUpperCase() + '.' : '';

  // every term must match as a whole word
  const patterns = uniq.map((t) => new RegExp('(?<![\\p{L}\\p{N}_])' + esc(t) + '(?![\\p{L}\\p{N}_])', 'iu'));
  const hits = rows.filter((r) => patterns.every((re) => re.test(r[3])));

  const books = await L.getBooks(used);
  const results = hits.slice(0, 5000).map(([b, c, v, text]) => {
    const bk = books[b - 1] || { id: '', name: 'Book ' + b };
    return { id: bk.id, book: bk.name, chapter: c, verse: v, text };
  });
  return { code: 200, body: { translation: used, query: q, terms: uniq, total: hits.length, note, results } };
}

module.exports = async (req, res) => {
  try {
    const tr = L.pickTranslation(req);

    if (req.query.q !== undefined) {
      const { code, body } = await searchBible(String(req.query.q).trim(), tr);
      return L.jsonOut(res, body, code);
    }

    const book = String(req.query.book || '').toUpperCase();
    const chapter = parseInt(req.query.chapter, 10) || 0;
    if (!/^[A-Z0-9]{3}$/.test(book) || chapter < 1) return L.jsonOut(res, { error: 'Invalid book or chapter.' }, 400);

    const d = await L.fetchJson(L.API + 'data/' + tr + '/' + book + '/' + chapter);
    const verses = (d.verses || []).map((v) => ({ verse: Number(v.verse || 0), text: String(v.text || '').trim() }));
    if (!verses.length) return L.jsonOut(res, { error: 'This chapter was not found in this translation.' }, 404);

    L.jsonOut(res, { translation: tr, book, chapter, verses });
  } catch (e) {
    L.jsonOut(res, { error: e.message }, 502);
  }
};
