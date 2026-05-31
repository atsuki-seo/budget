<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

function budget_import_source_types_param(): array
{
    $raw = $_GET['source_types'] ?? '';
    if ($raw === null || $raw === '') {
        return [];
    }

    if (!is_string($raw)) {
        throw new InvalidArgumentException('source_types must be comma-separated text.');
    }

    $sourceTypes = [];
    foreach (explode(',', $raw) as $sourceType) {
        $sourceType = trim($sourceType);
        if ($sourceType === '') {
            continue;
        }
        if (!in_array($sourceType, ['csv', 'bank_csv', 'manual'], true)) {
            throw new InvalidArgumentException('source_types contains an unsupported source type.');
        }

        $sourceTypes[$sourceType] = true;
    }

    return array_keys($sourceTypes);
}

try {
    $method = budget_require_method(['GET', 'POST', 'DELETE']);
    budget_require_admin();

    if ($method === 'GET') {
        $pdo = budget_pdo();
        $limit = budget_int_param('limit', 5, 1, 200);
        $offset = budget_int_param('offset', 0, 0, 1000000);
        $sourceTypes = budget_import_source_types_param();
        $params = [];
        $whereSql = '';

        if ($sourceTypes !== []) {
            $whereSql = 'WHERE source_type IN (' . implode(', ', array_fill(0, count($sourceTypes), '?')) . ')';
            $params = $sourceTypes;
        }

        $totalStmt = $pdo->prepare("SELECT COUNT(*) FROM imports $whereSql");
        $totalStmt->execute($params);
        $total = (int)$totalStmt->fetchColumn();

        $stmt = $pdo->prepare(
            "SELECT
                id,
                source_type,
                statement_payment_on,
                source_filename,
                row_count,
                imported_at
             FROM imports
             $whereSql
             ORDER BY imported_at DESC, id DESC
             LIMIT $limit OFFSET $offset"
        );
        $stmt->execute($params);

        $items = [];
        foreach ($stmt->fetchAll() as $row) {
            $items[] = [
                'id' => (int)$row['id'],
                'source_type' => $row['source_type'],
                'statement_payment_on' => $row['statement_payment_on'],
                'source_filename' => $row['source_filename'],
                'row_count' => (int)$row['row_count'],
                'imported_at' => $row['imported_at'],
            ];
        }

        budget_json_response([
            'items' => $items,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
        ]);
    }

    if ($method === 'POST') {
        budget_require_csrf();
        $pdo = budget_pdo();

        if (!isset($_FILES['csv']) || !is_array($_FILES['csv'])) {
            throw new InvalidArgumentException('CSV file is required.');
        }

        $file = $_FILES['csv'];
        $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException('CSV upload failed.');
        }

        $size = (int)($file['size'] ?? 0);
        $maxBytes = (int)(budget_config()['max_upload_bytes'] ?? (2 * 1024 * 1024));
        if ($size <= 0 || $size > $maxBytes) {
            throw new InvalidArgumentException('CSV file size is invalid.');
        }

        $tmpName = isset($file['tmp_name']) && is_string($file['tmp_name']) ? $file['tmp_name'] : '';
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            throw new InvalidArgumentException('CSV upload is invalid.');
        }

        $originalName = isset($file['name']) && is_string($file['name']) ? $file['name'] : 'uploaded.csv';
        $result = budget_import_csv($pdo, $tmpName, $originalName);

        budget_json_response(['import' => $result], 201);
    }

    budget_require_csrf();
    $pdo = budget_pdo();
    $id = budget_required_id(isset($_GET['id']) ? (string)$_GET['id'] : null);
    $stmt = $pdo->prepare('DELETE FROM imports WHERE id = ?');
    $stmt->execute([$id]);

    budget_json_response(['deleted' => $stmt->rowCount() > 0]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
