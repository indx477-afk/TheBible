<?php
// auth.php  (POST JSON)
//   {"action":"login","credential":"<Google ID token>"}  -> verifies the token, starts a session
//   {"action":"logout"}                                  -> ends the session
require_once __DIR__ . '/bible.php';

$in     = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
$action = $in['action'] ?? 'me';
$isPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';

if ($action === 'logout' && $isPost) {
    $_SESSION = [];
    session_destroy();
    json_out(['user' => null]);
}

if ($action === 'login' && $isPost) {
    $token = (string) ($in['credential'] ?? '');
    if ($token === '') json_out(['error' => 'Missing Google credential.'], 400);

    try {
        // Google checks the signature and expiry; we still confirm the token was issued for this app
        $g = fetch_json('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($token), 0);
    } catch (Throwable $e) {
        json_out(['error' => 'Google sign-in could not be verified.'], 401);
    }

    $issuerOk = in_array($g['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true);
    $emailOk  = filter_var($g['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
    if (($g['aud'] ?? '') !== GOOGLE_CLIENT_ID || !$issuerOk || !$emailOk || (int) ($g['exp'] ?? 0) < time()) {
        json_out(['error' => 'Google sign-in could not be verified.'], 401);
    }

    session_regenerate_id(true);
    $_SESSION['user'] = [
        'sub'     => $g['sub'],
        'email'   => $g['email'],
        'name'    => $g['name'] ?? $g['email'],
        'picture' => $g['picture'] ?? '',
    ];
}

json_out(['user' => public_user()]);
