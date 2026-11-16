// GET /api/bible -> info the page needs at startup (user, translations, book list)
const L = require('./_lib');

module.exports = async (req, res) => {
  try {
    const tr = L.pickTranslation(req);
    L.jsonOut(res, {
      user: L.publicUser(L.currentUser(req)),
      google_client_id: L.GOOGLE_CLIENT_ID,
      search_ready: L.hasDataFile('asv'),
      translation: tr,
      translations: L.allowedTranslations(req),
      books: await L.getBooks(tr),
    });
  } catch (e) {
    L.jsonOut(res, { error: e.message }, 502);
  }
};
