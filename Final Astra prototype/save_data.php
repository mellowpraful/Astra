<?php
// save_data.php
// Minimal endpoint to save JSON payloads to disk safely.
// POST JSON body: { "key": "erp_students", "data": [...] }

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
if (!$raw) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty request body']);
    exit;
}

$body = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

if (empty($body['key']) || !isset($body['data'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing key or data']);
    exit;
}

$key = preg_replace('/[^a-z0-9_\-]/i', '', $body['key']);
if ($key === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid key']);
    exit;
}

$dir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$file = $dir . DIRECTORY_SEPARATOR . $key . '.json';

// Write with exclusive lock to avoid corruption
$fp = fopen($file, 'c');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to open file']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to lock file']);
    fclose($fp);
    exit;
}

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($body['data'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(['ok' => true, 'file' => 'data/' . $key . '.json']);

