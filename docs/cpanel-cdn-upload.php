<?php
// Upload this file to your cPanel site, for example:
// public_html/api/crm-upload.php
// Adjust $uploadDirectory and $publicBaseUrl for your account before use.
// Keep CDN_UPLOAD_SIGNING_SECRET private and identical to the Vercel variable.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$allowedOrigins = [
    'https://crm.altuscorp.in',
    'http://localhost:3000',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    if (!in_array($origin, $allowedOrigins, true)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Origin is not allowed.']);
        exit;
    }
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST is required.']);
    exit;
}
// Configure this in cPanel's PHP environment or load it from a private PHP
// config file outside public_html. Never commit the real secret here.
$signingSecret = getenv('CDN_UPLOAD_SIGNING_SECRET') ?: '';
$uploadDirectory = __DIR__ . '/../uploads/lead-attachments';
$publicBaseUrl = 'https://cdn.productivityshastra.com/uploads/lead-attachments';
$maximumBytes = 100 * 1024 * 1024;
$allowedMimeTypes = [
    'application/pdf', 'text/plain', 'text/csv',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

function fail_upload(int $status, string $message): void {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

if ($signingSecret === '') fail_upload(503, 'Upload service is not configured.');
$leadId = is_string($_POST['lead_id'] ?? null) ? $_POST['lead_id'] : '';
$assignmentId = is_string($_POST['assignment_id'] ?? null) ? $_POST['assignment_id'] : '';
$nonce = is_string($_POST['nonce'] ?? null) ? $_POST['nonce'] : '';
$expires = is_string($_POST['expires'] ?? null) ? $_POST['expires'] : '';
$signature = is_string($_POST['signature'] ?? null) ? $_POST['signature'] : '';
$uuidPattern = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';
if (!preg_match($uuidPattern, $leadId) || !preg_match($uuidPattern, $assignmentId) || !preg_match($uuidPattern, $nonce) || !ctype_digit($expires)) fail_upload(400, 'Invalid upload permission.');
if ((int)$expires < time() || (int)$expires > time() + 600) fail_upload(401, 'Upload permission expired.');
$expectedSignature = hash_hmac('sha256', "{$leadId}|{$assignmentId}|{$nonce}|{$expires}", $signingSecret);
if (!hash_equals($expectedSignature, $signature)) fail_upload(401, 'Invalid upload permission.');

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) fail_upload(400, 'Choose a file.');
$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail_upload(400, 'The file could not be uploaded.');
if (!is_int($file['size']) || $file['size'] < 1 || $file['size'] > $maximumBytes) fail_upload(400, 'Files must be 100 MB or smaller.');
$temporaryPath = is_string($file['tmp_name'] ?? null) ? $file['tmp_name'] : '';
if ($temporaryPath === '' || !is_uploaded_file($temporaryPath)) fail_upload(400, 'Invalid upload.');
$extension = strtolower(pathinfo(is_string($file['name'] ?? null) ? $file['name'] : '', PATHINFO_EXTENSION));
$safeExtensions = ['pdf', 'txt', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'wav', 'ogg', 'm4a', 'mp4', 'webm', 'mov', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
if (!in_array($extension, $safeExtensions, true)) fail_upload(415, 'This file extension is not allowed.');
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($temporaryPath) ?: '';
// libmagic commonly identifies modern Office files as application/zip. Permit
// that generic MIME only when the extension is an Office document type.
$officeExtensions = ['docx', 'xlsx', 'pptx'];
if (!in_array($mime, $allowedMimeTypes, true) && !($mime === 'application/zip' && in_array($extension, $officeExtensions, true))) {
    fail_upload(415, 'This file type is not allowed.');
}

$relativeDirectory = date('Y/m');
$destinationDirectory = $uploadDirectory . '/' . $relativeDirectory;
if (!is_dir($destinationDirectory) && !mkdir($destinationDirectory, 0755, true) && !is_dir($destinationDirectory)) fail_upload(500, 'Upload folder is unavailable.');
$storedName = bin2hex(random_bytes(18)) . '.' . $extension;
$destinationPath = $destinationDirectory . '/' . $storedName;
if (!move_uploaded_file($temporaryPath, $destinationPath)) fail_upload(500, 'Unable to store the file.');

echo json_encode([
    'ok' => true,
    'url' => rtrim($publicBaseUrl, '/') . '/' . $relativeDirectory . '/' . $storedName,
    'name' => basename(is_string($file['name'] ?? null) ? $file['name'] : 'attachment.' . $extension),
    'mime' => $mime,
    'size' => $file['size'],
]);
