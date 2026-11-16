// GET /api/chapters?book=JHN&tr=asv -> {"chapters":[1,2,3,...]}
const L = require('./_lib');

module.exports = async (req, res) => {
  try {
    const book = String(req.query.book || '').toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(book)) return L.jsonOut(res, { error: 'Invalid book id.' }, 400);

    const tr = L.pickTranslation(req);
    const d = await L.fetchJson(L.API + 'data/' + tr + '/' + book);
    const chapters = (d.chapters || []).map((c) => Number(c.chapter ?? c.number ?? 0));
    if (!chapters.length) return L.jsonOut(res, { error: 'No chapters found for this book.' }, 404);

    L.jsonOut(res, { translation: tr, book, chapters });
  } catch (e) {
    L.jsonOut(res, { error: e.message }, 502);
  }
};
