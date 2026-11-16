<?php
// Shared helpers used by every endpoint. Opened directly, bible.php returns the info
// index.html needs at startup: signed-in user, allowed translations and the book list.

const API = 'https://bible-api.com/';
const DEFAULT_TR = 'asv';   // American Standard Version for guests
const TRANSLATIONS = [
    'asv'     => 'American Standard Version (1901)',
    'kjv'     => 'King James Version',
    'web'     => 'World English Bible',
    'bsb'     => 'Berean Standard Bible',
    'bbe'     => 'Bible in Basic English',
    'darby'   => 'Darby Bible',
    'tagalog' => 'Tagalog Bible (Ang Dating Biblia)',
];

// Paste the Client ID from Google Cloud Console here, or set the GOOGLE_CLIENT_ID environment variable
define('GOOGLE_CLIENT_ID', getenv('GOOGLE_CLIENT_ID') ?: '44493385061-gkab60b4069id1l8kk2mr654anav9gic.apps.googleusercontent.com');

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();

function json_out(array $data, int $code = 200)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function public_user(): ?array
{
    $u = current_user();
    return $u ? ['name' => $u['name'], 'picture' => $u['picture']] : null;
}

// Guests always get ASV. Signed-in users may pick any listed translation.
function allowed_translations(): array
{
    return current_user() ? TRANSLATIONS : [DEFAULT_TR => TRANSLATIONS[DEFAULT_TR]];
}

function pick_translation(): string
{
    $tr = strtolower($_GET['tr'] ?? DEFAULT_TR);
    return isset(allowed_translations()[$tr]) ? $tr : DEFAULT_TR;
}

// Same cURL approach as your original scripts, plus a file cache (bible-api.com allows 15 requests per 30 seconds)
function fetch_json(string $url, int $ttl = 86400): array
{
    $cache = sys_get_temp_dir() . '/bibleapp_' . md5($url) . '.json';
    if ($ttl > 0 && is_file($cache) && time() - filemtime($cache) < $ttl) {
        $cached = json_decode((string) file_get_contents($cache), true);
        if (is_array($cached)) return $cached;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; PHP script)',
    ]);
    $response = curl_exec($ch);
    $code     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);

    if ($response === false) throw new RuntimeException('Network error: ' . $error);
    if ($code === 429)       throw new RuntimeException('The Bible API is busy (limit: 15 requests per 30 seconds). Wait a moment and try again.');
    if ($code === 404)       throw new RuntimeException('Not found in this translation.');
    if ($code !== 200)       throw new RuntimeException('The API returned HTTP ' . $code);

    $data = json_decode($response, true);
    if (!is_array($data))    throw new RuntimeException('Bad JSON: ' . json_last_error_msg());

    if ($ttl > 0) @file_put_contents($cache, $response);
    return $data;
}

function get_books(string $tr): array
{
    $d = fetch_json(API . 'data/' . $tr);
    return array_map(fn($b) => ['id' => $b['id'] ?? '', 'name' => $b['name'] ?? ''], $d['books'] ?? []);
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        $tr = pick_translation();
        json_out([
            'user'             => public_user(),
            'google_client_id' => GOOGLE_CLIENT_ID,
            'search_ready'     => is_file(__DIR__ . '/data/eng-asv.zefania.xml'),
            'translation'      => $tr,
            'translations'     => allowed_translations(),
            'books'            => get_books($tr),
        ]);
    } catch (Throwable $e) {
        json_out(['error' => $e->getMessage()], 502);
    }
}