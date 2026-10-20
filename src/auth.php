<?php
declare(strict_types=1);

/**
 * Very small passkey gate.
 *
 * The passkey is checked on the server. On success the browser receives a
 * signed, HttpOnly cookie (valid for one year), so the user is not asked again
 * on later visits. Storing the passkey itself in a cookie/localStorage would
 * expose it to JavaScript and make it trivial to fake.
 */

require_once __DIR__ . '/db.php';

const AUTH_PASSKEY = 'la-tua-passkey';
const AUTH_COOKIE = 'dd_auth';
const AUTH_TTL = 60 * 60 * 24 * 365; // one year

function auth_secret(): string
{
    $secret = get_config('auth_secret');
    if ($secret === null || strlen($secret) < 32) {
        $secret = bin2hex(random_bytes(32));
        set_config('auth_secret', $secret);
    }

    return $secret;
}

function auth_signature(string $expires): string
{
    return hash_hmac('sha256', $expires, auth_secret());
}

function auth_is_logged_in(): bool
{
    $value = $_COOKIE[AUTH_COOKIE] ?? null;
    if (!is_string($value) || !str_contains($value, '.')) {
        return false;
    }

    [$expires, $signature] = explode('.', $value, 2);

    if (!ctype_digit($expires) || (int) $expires < time()) {
        return false;
    }

    return hash_equals(auth_signature($expires), $signature);
}

function auth_set_cookie(): void
{
    $expires = (string) (time() + AUTH_TTL);
    $token = $expires . '.' . auth_signature($expires);

    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    setcookie(AUTH_COOKIE, $token, [
        'expires'  => time() + AUTH_TTL,
        'path'     => '/',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function auth_clear_cookie(): void
{
    setcookie(AUTH_COOKIE, '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function auth_check_passkey(string $passkey): bool
{
    return hash_equals(AUTH_PASSKEY, $passkey);
}
