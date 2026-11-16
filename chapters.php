<?php
// chapters.php?book=JHN&tr=asv  ->  {"chapters":[1,2,3,...]}
require_once __DIR__ . '/bible.php';

try {
    $book = strtoupper($_GET['book'] ?? '');
    if (!preg_match('/^[A-Z0-9]{3}$/', $book)) json_out(['error' => 'Invalid book id.'], 400);

    $tr = pick_translation();
    $d  = fetch_json(API . 'data/' . $tr . '/' . $book);

    $chapters = [];
    foreach ($d['chapters'] ?? [] as $c) {
        $chapters[] = (int) ($c['chapter'] ?? $c['number'] ?? 0);
    }
    if (!$chapters) json_out(['error' => 'No chapters found for this book.'], 404);

    json_out(['translation' => $tr, 'book' => $book, 'chapters' => $chapters]);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 502);
}
