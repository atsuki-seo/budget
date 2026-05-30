<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

try {
    budget_require_method(['GET']);

    $pdo = budget_pdo();
    [, $dateColumn, $amountColumn] = budget_amount_basis();
    $groupBy = $_GET['group_by'] ?? 'month';
    if (!is_string($groupBy)) {
        $groupBy = 'month';
    }

    $periodMap = [
        'day' => $dateColumn,
        'week' => "DATE_SUB($dateColumn, INTERVAL WEEKDAY($dateColumn) DAY)",
        'month' => "DATE_FORMAT($dateColumn, '%Y-%m-01')",
    ];
    if (!isset($periodMap[$groupBy])) {
        throw new InvalidArgumentException('group_by is invalid.');
    }

    $isAdmin = budget_is_admin();
    $includeDeleted = $isAdmin && (($_GET['include_deleted'] ?? '') === '1');
    $params = [];
    [$joins, $where] = budget_transaction_filter_sql($params, $includeDeleted, $dateColumn);

    $whereSql = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
    $joinSql = implode(' ', $joins);
    $periodExpr = $periodMap[$groupBy];

    $stmt = $pdo->prepare(
        "SELECT
            $periodExpr AS period_start,
            COUNT(*) AS transaction_count,
            COALESCE(SUM($amountColumn), 0) AS amount
         FROM transactions t
         $joinSql
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
        'group_by' => $groupBy,
        'logged_in' => $isAdmin,
    ]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}

