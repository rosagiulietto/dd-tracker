<?php
declare(strict_types=1);

/**
 * SQLite connection + schema.
 *
 * The database file lives in /data (outside the web root), so it is
 * never reachable from a browser URL.
 */

const DEFAULT_MAX_COMICS = 500;

function db(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dataDir = dirname(__DIR__) . '/data';

        if (!is_dir($dataDir)) {
            mkdir($dataDir, 0775, true);
        }

        $pdo = new PDO('sqlite:' . $dataDir . '/dylan.sqlite');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');

        db_init($pdo);
    }

    return $pdo;
}

function db_init(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS owned (
            number INTEGER PRIMARY KEY
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )'
    );

    $pdo->prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)')
        ->execute(['max_comics', (string) DEFAULT_MAX_COMICS]);
}

function get_config(string $key, ?string $default = null): ?string
{
    $stmt = db()->prepare('SELECT value FROM config WHERE key = ?');
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();

    return $value === false ? $default : (string) $value;
}

function set_config(string $key, string $value): void
{
    $stmt = db()->prepare(
        'INSERT INTO config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    $stmt->execute([$key, $value]);
}

/** @return int[] */
function get_owned(): array
{
    $rows = db()->query('SELECT number FROM owned ORDER BY number')->fetchAll(PDO::FETCH_COLUMN);

    return array_map('intval', $rows);
}

function current_state(): array
{
    return [
        'owned'       => get_owned(),
        'totalComics' => (int) get_config('max_comics', (string) DEFAULT_MAX_COMICS),
        'lastUpdate'  => get_config('last_update'),
    ];
}

/** Record the moment of the last change (UTC, ISO 8601). */
function touch_last_update(): void
{
    set_config('last_update', gmdate('c'));
}
