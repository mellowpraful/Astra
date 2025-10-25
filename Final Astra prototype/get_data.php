<?php
// get_data.php
// GET ?key=erp_students  -> returns contents of data/erp_students.json

header('Content-Type: application/json; charset=utf-8');

$key = isset($_GET['key']) ? preg_replace('/[^a-z0-9_\-]/i', '', $_GET['key']) : '';
if ($key === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid key']);
    exit;
}

$file = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . $key . '.json';
if (!file_exists($file)) {
    echo json_encode([]); // return empty array if file not present
    exit;
}

$raw = file_get_contents($file);
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to read file']);
    exit;
}

$decoded = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    // If file is corrupted, return raw content as string inside response for debugging
    echo json_encode(['error' => 'Corrupt JSON file', 'raw' => $raw]);
    exit;
}

echo json_encode($decoded);
