<?php
// verse.php?book=JHN&chapter=3&tr=asv  ->  verses of one chapter
// verse.php?q=lift you up&tr=asv       ->  word / phrase search (all words must match; "quotes" for an exact phrase)
//
// bible-api.com has no search and asks people not to download a whole Bible through it,
// so search reads a local file: data/eng-asv.zefania.xml (from github.com/seven1m/open-bibles).
// Any other eng-<id>.zefania.xml you add to data/ (for example eng-darby.zefania.xml) becomes searchable too.
require_once __DIR__ . '/bible.php';

function index_file(string $tr): string
{
    return __DIR__ . '/data/eng-' . $tr . '.zefania.xml';
}

// Reads the XML once, then keeps a compact JSON copy in the temp folder
function load_index(string $tr): ?array
{
    $file = index_file($tr);
    if (!is_file($file)) return null;

    $cache = sys_get_temp_dir() . '/bibleidx_' . $tr . '_' . filemtime($file) . '.json';
    if (is_file($cache)) {
        $rows = json_decode((string) file_get_contents($cache), true);
        if (is_array($rows)) return $rows;
    }

    $rows = [];
    $b = $c = 0;
    $x = new XMLReader();
    $x->open($file);
    while ($x->read()) {
        if ($x->nodeType !== XMLReader::ELEMENT) continue;
        if ($x->name === 'BIBLEBOOK')   $b = (int) $x->getAttribute('bnumber');
        elseif ($x->name === 'CHAPTER') $c = (int) $x->getAttribute('cnumber');
        elseif ($x->name === 'VERS')    $rows[] = [$b, $c, (int) $x->getAttribute('vnumber'), trim($x->readString())];
    }
    $x->close();

    if (!$rows) throw new RuntimeException('Could not read any verses from ' . basename($file) . '.');
    @file_put_contents($cache, json_encode($rows, JSON_UNESCAPED_UNICODE));
    return $rows;
}

function search_bible(string $q, string $tr): array
{
    preg_match_all('/"([^"]+)"|(\S+)/u', $q, $m, PREG_SET_ORDER);
    $terms = [];
    foreach ($m as $x) {
        $t = trim(($x[1] ?? '') !== '' ? $x[1] : ($x[2] ?? ''));
        if (mb_strlen($t) >= 2) $terms[] = $t;
    }
    $terms = array_slice(array_values(array_unique($terms)), 0, 6);
    if (!$terms) json_out(['error' => 'Type a word of at least two letters.'], 400);

    $used = is_file(index_file($tr)) ? $tr : DEFAULT_TR;
    $rows = load_index($used);
    if ($rows === null) {
        throw new RuntimeException('Search needs the ASV text file. Download eng-asv.zefania.xml from github.com/seven1m/open-bibles and save it in the data folder.');
    }
    $note = $used !== $tr
        ? strtoupper($tr) . ' is not set up for search, so these matches come from ' . strtoupper($used) . '.'
        : '';

    // every term must match as a whole word, so "king" finds "king" but not "kingdom" or "kings"
    $patterns = array_map(fn($t) => '/(?<!\w)' . preg_quote($t, '/') . '(?!\w)/iu', $terms);
    $hits = [];
    foreach ($rows as $row) {
        foreach ($patterns as $re) {
            if (!preg_match($re, $row[3])) continue 2;
        }
        $hits[] = $row;
    }

    $books = get_books($used);
    $out = [];
    foreach (array_slice($hits, 0, 5000) as [$b, $c, $v, $text]) {
        $bk = $books[$b - 1] ?? ['id' => '', 'name' => 'Book ' . $b];
        $out[] = ['id' => $bk['id'], 'book' => $bk['name'], 'chapter' => $c, 'verse' => $v, 'text' => $text];
    }

    return ['translation' => $used, 'query' => $q, 'terms' => $terms, 'total' => count($hits), 'note' => $note, 'results' => $out];
}

try {
    $tr = pick_translation();

    if (isset($_GET['q'])) json_out(search_bible(trim($_GET['q']), $tr));

    $book    = strtoupper($_GET['book'] ?? '');
    $chapter = (int) ($_GET['chapter'] ?? 0);
    if (!preg_match('/^[A-Z0-9]{3}$/', $book) || $chapter < 1) json_out(['error' => 'Invalid book or chapter.'], 400);

    $d = fetch_json(API . 'data/' . $tr . '/' . $book . '/' . $chapter);
    $verses = [];
    foreach ($d['verses'] ?? [] as $v) {
        $verses[] = ['verse' => (int) ($v['verse'] ?? 0), 'text' => trim((string) ($v['text'] ?? ''))];
    }
    if (!$verses) json_out(['error' => 'This chapter was not found in this translation.'], 404);

    json_out(['translation' => $tr, 'book' => $book, 'chapter' => $chapter, 'verses' => $verses]);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 502);
}