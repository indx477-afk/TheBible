// Shared helpers (the underscore keeps Vercel from exposing this file as an endpoint)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://bible-api.com/';
const DEFAULT_TR = 'asv';
const TRANSLATIONS = {
  asv: 'American Standard Version (1901)',
  kjv: 'King James Version',
  web: 'World English Bible',
  bsb: 'Berean Standard Bible',
  bbe: 'Bible in Basic English',
  darby: 'Darby Bible',
  tagalog: 'Tagalog Bible (Ang Dating Biblia)',
};
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '44493385061-gkab60b4069id1l8kk2mr654anav9gic.apps.googleusercontent.com';

// ---------- response helper ----------
function jsonOut(res, data, code = 200) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

// ---------- stateless session (signed cookie, replaces PHP sessions) ----------
// Set SESSION_SECRET in Vercel > Settings > Environment Variables (any long random string).
const SECRET = process.env.SESSION_SECRET || 'dev-only-change-me-' + GOOGLE_CLIENT_ID;
const COOKIE = 'bible_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function currentUser(req) {
  const raw = readCookies(req)[COOKIE];
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return data.user || null;
  } catch {
    return null;
  }
}

function setSession(res, user) {
  const payload = Buffer.from(
    JSON.stringify({ user, exp: Math.floor(Date.now() / 1000) + MAX_AGE })
  ).toString('base64url');
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
  );
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

const publicUser = (u) => (u ? { name: u.name, picture: u.picture } : null);

function allowedTranslations(req) {
  return currentUser(req) ? TRANSLATIONS : { [DEFAULT_TR]: TRANSLATIONS[DEFAULT_TR] };
}

function pickTranslation(req) {
  const tr = String((req.query && req.query.tr) || DEFAULT_TR).toLowerCase();
  return Object.prototype.hasOwnProperty.call(allowedTranslations(req), tr) ? tr : DEFAULT_TR;
}

// ---------- bible-api.com fetch with in-memory cache ----------
const cache = new Map();
async function fetchJson(url, ttl = 86400) {
  const hit = cache.get(url);
  if (ttl > 0 && hit && Date.now() - hit.t < ttl * 1000) return hit.d;

  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheBible)' } });
  if (r.status === 429) throw new Error('The Bible API is busy (limit: 15 requests per 30 seconds). Wait a moment and try again.');
  if (r.status === 404) throw new Error('Not found in this translation.');
  if (!r.ok) throw new Error('The API returned HTTP ' + r.status);
  const d = await r.json();
  if (!d || typeof d !== 'object') throw new Error('Bad JSON from the Bible API.');
  if (ttl > 0) cache.set(url, { t: Date.now(), d });
  return d;
}

async function getBooks(tr) {
  const d = await fetchJson(API + 'data/' + tr);
  return (d.books || []).map((b) => ({ id: b.id || '', name: b.name || '' }));
}

const dataFile = (tr) => path.join(process.cwd(), 'data', 'eng-' + tr + '.zefania.xml');
const hasDataFile = (tr) => fs.existsSync(dataFile(tr));

module.exports = {
  API, DEFAULT_TR, TRANSLATIONS, GOOGLE_CLIENT_ID,
  jsonOut, currentUser, setSession, clearSession, publicUser,
  allowedTranslations, pickTranslation, fetchJson, getBooks, dataFile, hasDataFile,
};
