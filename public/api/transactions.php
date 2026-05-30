<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

try {
    $method = budget_require_method(['GET', 'POST', 'DELETE']);

    if ($method === 'GET') {
        $pdo = budget_pdo();
        [, $dateColumn] = budget_amount_basis();
        $isAdmin = budget_is_admin();
        $includeDeleted = $isAdmin && (($_GET['include_deleted'] ?? '') === '1');
        $params = [];
        [$joins, $where] = budget_transaction_filter_sql($params, $includeDeleted, $dateColumn);

        $whereSql = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $joinSql = implode(' ', $joins);

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions t $joinSql $whereSql");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sortMap = [
            'budget_date' => 't.budget_date',
            'used_on' => 't.used_on',
            'statement_payment_on' => 't.statement_payment_on',
            'merchant' => 't.merchant',
            'budget_amount' => 't.budget_amount',
            'created_at' => 't.created_at',
        ];
        $sort = $_GET['sort'] ?? 'used_on';
        if (!is_string($sort) || !isset($sortMap[$sort])) {
            $sort = 'used_on';
        }

        $dir = strtolower((string)($_GET['dir'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';
        $limit = budget_int_param('limit', 100, 1, 200);
        $offset = budget_int_param('offset', 0, 0, 1000000);

        $sql = "SELECT
                    t.id,
                    t.import_id,
                    t.statement_payment_on,
                    t.used_on,
                    t.merchant,
                    t.card_user,
                    t.payment_method,
                    t.payment_category,
                    t.usage_amount,
                    t.fee_amount,
                    t.total_amount,
                    t.billing_amount,
                    t.carried_forward_amount,
                    t.adjustment_amount,
                    t.budget_date,
                    t.budget_amount,
                    t.source_row_number,
                    t.deleted_at,
                    t.superseded_at,
                    i.deleted_at AS import_deleted_at,
                    t.created_at,
                    t.updated_at
                FROM transactions t
                $joinSql
                $whereSql
                ORDER BY {$sortMap[$sort]} $dir, t.id $dir
                LIMIT $limit OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll();

        $transactionIds = array_map(static function (array $row): int {
            return (int)$row['id'];
        }, $items);
        $labelsByTransaction = budget_fetch_transaction_labels($pdo, $transactionIds);

        foreach ($items as &$item) {
            $id = (int)$item['id'];
            $item['id'] = $id;
            $item['import_id'] = (int)$item['import_id'];
            $item['usage_amount'] = (int)$item['usage_amount'];
            $item['fee_amount'] = (int)$item['fee_amount'];
            $item['total_amount'] = (int)$item['total_amount'];
            $item['billing_amount'] = (int)$item['billing_amount'];
            $item['carried_forward_amount'] = (int)$item['carried_forward_amount'];
            $item['adjustment_amount'] = (int)$item['adjustment_amount'];
            $item['budget_amount'] = (int)$item['budget_amount'];
            $item['source_row_number'] = (int)$item['source_row_number'];
            $item['labels'] = $labelsByTransaction[$id] ?? [];

            if (!$isAdmin) {
                unset(
                    $item['import_id'],
                    $item['source_row_number'],
                    $item['deleted_at'],
                    $item['superseded_at'],
                    $item['import_deleted_at'],
                    $item['created_at'],
                    $item['updated_at']
                );
            }
        }
        unset($item);

        budget_json_response([
            'items' => $items,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'logged_in' => $isAdmin,
        ]);
    }

    if ($method === 'DELETE') {
        budget_require_admin();
        budget_require_csrf();
        $pdo = budget_pdo();
        $id = budget_required_id(isset($_GET['id']) ? (string)$_GET['id'] : null);

        $stmt = $pdo->prepare(
            'UPDATE transactions
             SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );
        $stmt->execute([$id]);

        budget_json_response(['deleted' => $stmt->rowCount() > 0]);
    }

    budget_require_admin();
    budget_require_csrf();
    $pdo = budget_pdo();
    $data = budget_request_data();
    $action = $_GET['action'] ?? ($data['action'] ?? '');
    if ($action !== 'restore') {
        budget_json_error('Unsupported transaction action.', 400);
    }

    $id = budget_required_id(isset($_GET['id']) ? (string)$_GET['id'] : (isset($data['id']) ? (string)$data['id'] : null));
    $stmt = $pdo->prepare(
        'UPDATE transactions
         SET deleted_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?'
    );
    $stmt->execute([$id]);

    budget_json_response(['restored' => $stmt->rowCount() > 0]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
