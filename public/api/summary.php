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

    $stmt = $pdo->prepare(
        "SELECT
            DATE_FORMAT(t.statement_payment_on, '%Y-%m-01') AS period_start,
            COUNT(*) AS transaction_count,
            COALESCE(SUM(t.billing_amount), 0) AS amount
         FROM transactions t
         $whereSql
         GROUP BY period_start
         ORDER BY period_start ASC
         LIMIT 5000"
    );
    $stmt->execute($params);

    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'period_start' => $row['period_start'],
            'transaction_count' => (int)$row['transaction_count'],
            'amount' => (int)$row['amount'],
        ];
    }

    budget_json_response([
        'items' => $items,
        'logged_in' => $isAdmin,
    ]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
