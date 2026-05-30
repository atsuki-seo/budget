<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

try {
    budget_require_method(['GET']);

    $pdo = budget_pdo();
    $isAdmin = budget_is_admin();
    $params = [];
    $where = budget_transaction_filter_sql($params);

    $whereSql = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions t $whereSql");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $limit = budget_int_param('limit', 100, 1, 200);
    $offset = budget_int_param('offset', 0, 0, 1000000);

    $sql = "SELECT
                t.id,
                t.statement_payment_on,
                t.used_on,
                t.merchant,
                t.card_user,
                t.payment_method,
                t.payment_category,
                t.usage_amount,
                t.billing_amount,
                t.carried_forward_amount,
                t.adjustment_amount
            FROM transactions t
            $whereSql
            ORDER BY t.used_on DESC, t.id DESC
            LIMIT $limit OFFSET $offset";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $items = $stmt->fetchAll();

    foreach ($items as &$item) {
        $item['id'] = (int)$item['id'];
        $item['usage_amount'] = (int)$item['usage_amount'];
        $item['billing_amount'] = (int)$item['billing_amount'];
        $item['carried_forward_amount'] = (int)$item['carried_forward_amount'];
        $item['adjustment_amount'] = (int)$item['adjustment_amount'];
    }
    unset($item);

    budget_json_response([
        'items' => $items,
        'total' => $total,
        'limit' => $limit,
        'offset' => $offset,
        'logged_in' => $isAdmin,
    ]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
