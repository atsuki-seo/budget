<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

function budget_label_color($value): string
{
    $color = is_scalar($value) ? (string)$value : '#2563eb';
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
        throw new InvalidArgumentException('Label color is invalid.');
    }

    return strtolower($color);
}

try {
    $method = budget_require_method(['GET', 'POST', 'PUT', 'DELETE']);

    if ($method === 'GET') {
        $pdo = budget_pdo();
        $stmt = $pdo->query(
            "SELECT
                l.id,
                l.name,
                l.color,
                COUNT(CASE
                    WHEN t.id IS NOT NULL
                     AND t.deleted_at IS NULL
                     AND t.superseded_at IS NULL
                     AND i.deleted_at IS NULL
                    THEN 1
                END) AS transaction_count
             FROM labels l
             LEFT JOIN transaction_labels tl ON tl.label_id = l.id
             LEFT JOIN transactions t ON t.id = tl.transaction_id
             LEFT JOIN imports i ON i.id = t.import_id
             GROUP BY l.id, l.name, l.color
             ORDER BY l.name ASC"
        );

        $items = [];
        foreach ($stmt->fetchAll() as $row) {
            $items[] = [
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'color' => $row['color'],
                'transaction_count' => (int)$row['transaction_count'],
            ];
        }

        budget_json_response(['items' => $items]);
    }

    budget_require_admin();
    budget_require_csrf();
    $pdo = budget_pdo();
    $data = budget_request_data();
    $action = $_GET['action'] ?? ($data['action'] ?? '');

    if ($method === 'POST' && $action === 'assign') {
        $transactionId = budget_required_id(isset($data['transaction_id']) ? (string)$data['transaction_id'] : null);
        $labelId = budget_required_id(isset($data['label_id']) ? (string)$data['label_id'] : null);
        $stmt = $pdo->prepare(
            'INSERT IGNORE INTO transaction_labels (transaction_id, label_id)
             VALUES (?, ?)'
        );
        $stmt->execute([$transactionId, $labelId]);

        budget_json_response(['assigned' => true]);
    }

    if ($method === 'POST') {
        $name = budget_clean_text($data['name'] ?? '', 80, 'Label name');
        if ($name === '') {
            throw new InvalidArgumentException('Label name is required.');
        }
        $color = budget_label_color($data['color'] ?? '#2563eb');

        try {
            $stmt = $pdo->prepare('INSERT INTO labels (name, color) VALUES (?, ?)');
            $stmt->execute([$name, $color]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                budget_json_error('Label name already exists.', 409);
            }
            throw $exception;
        }

        budget_json_response([
            'id' => (int)$pdo->lastInsertId(),
            'name' => $name,
            'color' => $color,
        ], 201);
    }

    if ($method === 'PUT') {
        $id = budget_required_id(isset($_GET['id']) ? (string)$_GET['id'] : (isset($data['id']) ? (string)$data['id'] : null));
        $name = budget_clean_text($data['name'] ?? '', 80, 'Label name');
        if ($name === '') {
            throw new InvalidArgumentException('Label name is required.');
        }
        $color = budget_label_color($data['color'] ?? '#2563eb');

        $stmt = $pdo->prepare(
            'UPDATE labels
             SET name = ?,
                 color = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );
        $stmt->execute([$name, $color, $id]);

        budget_json_response(['updated' => $stmt->rowCount() > 0]);
    }

    if ($action === 'unassign') {
        $transactionId = budget_required_id(isset($_GET['transaction_id']) ? (string)$_GET['transaction_id'] : null);
        $labelId = budget_required_id(isset($_GET['label_id']) ? (string)$_GET['label_id'] : null);
        $stmt = $pdo->prepare(
            'DELETE FROM transaction_labels
             WHERE transaction_id = ?
               AND label_id = ?'
        );
        $stmt->execute([$transactionId, $labelId]);

        budget_json_response(['unassigned' => $stmt->rowCount() > 0]);
    }

    $id = budget_required_id(isset($_GET['id']) ? (string)$_GET['id'] : null);
    $stmt = $pdo->prepare('DELETE FROM labels WHERE id = ?');
    $stmt->execute([$id]);

    budget_json_response(['deleted' => $stmt->rowCount() > 0]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
