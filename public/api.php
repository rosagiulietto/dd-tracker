<?php
declare(strict_types=1);

/**
 * Tiny JSON API for the Dylan Dog Tracker.
 *
 * GET  api.php?action=state                  -> full current state
 * POST api.php?action=toggle   {num}         -> flip one comic
 * POST api.php?action=max      {totalComics} -> change the max number
 * POST api.php?action=import   {owned, totalComics} -> replace collection
 * POST api.php?action=reset                  -> empty the collection
 *
 * All responses look like: {"ok": true, "state": {...}} or
 * {"ok": false, "error": "..."}.
 */

require __DIR__ . '/../src/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const MAX_COMICS_LIMIT = 100000;

function respond(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $code = 400): void
{
    respond(['ok' => false, 'error' => $message], $code);
}

function ok(): void
{
    respond(['ok' => true, 'state' => current_state()]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? null;

$body = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if ($raw !== false && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            fail('Invalid JSON body');
        }
        $body = $decoded;
        $action ??= isset($decoded['action']) ? (string) $decoded['action'] : null;
    }
}

try {
    if ($method === 'GET') {
        if ($action === null || $action === 'state') {
            ok();
        }
        fail('Unknown action');
    }

    if ($method !== 'POST') {
        fail('Method not allowed', 405);
    }

    $pdo = db();

    switch ($action) {
        case 'toggle':
            $num = (int) ($body['num'] ?? 0);
            if ($num < 1) {
                fail('Invalid comic number');
            }

            $stmt = $pdo->prepare('SELECT 1 FROM owned WHERE number = ?');
            $stmt->execute([$num]);

            if ($stmt->fetchColumn()) {
                $pdo->prepare('DELETE FROM owned WHERE number = ?')->execute([$num]);
            } else {
                $pdo->prepare('INSERT INTO owned (number) VALUES (?)')->execute([$num]);
            }

            touch_last_update();
            ok();
            // no break (ok() exits)

        case 'max':
            $total = (int) ($body['totalComics'] ?? 0);
            if ($total < 1 || $total > MAX_COMICS_LIMIT) {
                fail('Invalid max comics value');
            }

            set_config('max_comics', (string) $total);
            touch_last_update();
            ok();

        case 'import':
            $owned = $body['owned'] ?? null;
            if (!is_array($owned)) {
                fail('Invalid owned list');
            }

            // Accept both bare numbers and the older {numero: ...} objects,
            // then deduplicate.
            $numbers = [];
            foreach ($owned as $item) {
                if (is_int($item) || (is_string($item) && ctype_digit($item))) {
                    $n = (int) $item;
                } elseif (is_array($item) && isset($item['numero'])) {
                    $n = (int) $item['numero'];
                } else {
                    continue;
                }
                if ($n > 0) {
                    $numbers[$n] = true;
                }
            }

            $pdo->beginTransaction();
            try {
                $pdo->exec('DELETE FROM owned');
                $insert = $pdo->prepare('INSERT OR IGNORE INTO owned (number) VALUES (?)');
                foreach (array_keys($numbers) as $n) {
                    $insert->execute([$n]);
                }

                if (isset($body['totalComics'])) {
                    $total = (int) $body['totalComics'];
                    if ($total > 0 && $total <= MAX_COMICS_LIMIT) {
                        set_config('max_comics', (string) $total);
                    }
                }

                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }

            touch_last_update();
            ok();

        case 'reset':
            $pdo->exec('DELETE FROM owned');
            touch_last_update();
            ok();
    }

    fail('Unknown action');
} catch (Throwable $e) {
    fail('Server error', 500);
}
