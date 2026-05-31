<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

try {
    budget_require_method(['GET']);
    budget_require_admin();

    $pdo = budget_pdo();
    $transactionType = budget_normalize_manual_transaction_type([
        'transaction_type' => $_GET['transaction_type'] ?? 'expense',
    ]);
    $limit = budget_int_param('limit', 5, 1, 200);
    $offset = budget_int_param('offset', 0, 0, 1000000);
    $params = [$transactionType];

    $totalStmt = $pdo->prepare(
        "SELECT COUNT(*)
         FROM transactions t
         INNER JOIN imports i ON i.id = t.import_id
         WHERE i.source_type = 'manual'
           AND t.transaction_type = ?"
    );
    $totalStmt->execute($params);
    $total = (int)$totalStmt->fetchColumn();

    $stmt = $pdo->prepare(
        "SELECT
            t.id,
            t.import_id,
            t.transaction_type,
            t.statement_payment_on,
            t.used_on,
            t.merchant,
            t.card_user,
            t.payment_method,
            t.payment_category,
            t.usage_amount,
            t.billing_amount,
            t.carried_forward_amount,
            t.adjustment_amount,
            t.created_at,
            i.imported_at
         FROM transactions t
         INNER JOIN imports i ON i.id = t.import_id
         WHERE i.source_type = 'manual'
           AND t.transaction_type = ?
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT $limit OFFSET $offset"
    );
    $stmt->execute($params);

    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (int)$row['id'],
            'import_id' => (int)$row['import_id'],
            'transaction_type' => $row['transaction_type'],
            'statement_payment_on' => $row['statement_payment_on'],
            'used_on' => $row['used_on'],
            'merchant' => $row['merchant'],
            'card_user' => $row['card_user'],
            'payment_method' => $row['payment_method'],
            'payment_category' => $row['payment_category'],
            'usage_amount' => (int)$row['usage_amount'],
            'billing_amount' => (int)$row['billing_amount'],
            'carried_forward_amount' => (int)$row['carried_forward_amount'],
            'adjustment_amount' => (int)$row['adjustment_amount'],
            'created_at' => $row['created_at'],
            'imported_at' => $row['imported_at'],
        ];
    }

    budget_json_response([
        'items' => $items,
        'total' => $total,
        'limit' => $limit,
        'offset' => $offset,
        'transaction_type' => $transactionType,
    ]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
