<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

try {
    $method = budget_require_method(['GET', 'POST', 'DELETE']);
    budget_require_admin();

    if ($method === 'GET') {
        $pdo = budget_pdo();
        $limit = budget_int_param('limit', 5, 1, 200);
        $offset = budget_int_param('offset', 0, 0, 1000000);

        $totalStmt = $pdo->query(
            'SELECT COUNT(*)
             FROM (
                SELECT statement_payment_on
                FROM imports
                WHERE deleted_at IS NULL
                GROUP BY statement_payment_on
             ) payment_dates'
        );
        $total = (int)$totalStmt->fetchColumn();

        $stmt = $pdo->query(
            "SELECT
                i.id,
                i.statement_payment_on,
                i.source_filename,
                i.row_count,
                i.inserted_count,
                i.updated_count,
                i.unchanged_count,
                i.superseded_count,
                i.imported_at,
                i.deleted_at
             FROM imports i
             WHERE i.deleted_at IS NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM imports newer
                    WHERE newer.deleted_at IS NULL
                      AND newer.statement_payment_on = i.statement_payment_on
                      AND (
                        newer.imported_at > i.imported_at
                        OR (newer.imported_at = i.imported_at AND newer.id > i.id)
                      )
               )
             ORDER BY i.imported_at DESC, i.id DESC
             LIMIT $limit OFFSET $offset"
        );

        $items = [];
        foreach ($stmt->fetchAll() as $row) {
            $items[] = [
                'id' => (int)$row['id'],
                'statement_payment_on' => $row['statement_payment_on'],
                'source_filename' => $row['source_filename'],
                'row_count' => (int)$row['row_count'],
                'inserted_count' => (int)$row['inserted_count'],
                'updated_count' => (int)$row['updated_count'],
                'unchanged_count' => (int)$row['unchanged_count'],
                'superseded_count' => (int)$row['superseded_count'],
                'imported_at' => $row['imported_at'],
                'deleted_at' => $row['deleted_at'],
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
    $stmt = $pdo->prepare(
        'UPDATE imports
         SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
         WHERE id = ?'
    );
    $stmt->execute([$id]);

    budget_json_response(['deleted' => $stmt->rowCount() > 0]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
