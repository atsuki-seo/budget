<?php

declare(strict_types=1);

const BUDGET_REQUIRED_HEADERS = [
    '利用日/キャンセル日',
    '利用店名・商品名',
    '利用者',
    '決済方法',
    '支払区分',
    '利用金額',
    '手数料',
    '支払総額',
    '当月支払金額',
    '翌月以降繰越金額',
    '調整額',
    '当月お支払日',
];

function budget_config(): array
{
    static $config = null;

    if ($config !== null) {
        return $config;
    }

    $candidates = [];
    $envPath = getenv('BUDGET_CONFIG_PATH');
    if (is_string($envPath) && $envPath !== '') {
        $candidates[] = $envPath;
    }

    $candidates[] = dirname(__DIR__, 3) . '/budget-config.php';
    $candidates[] = dirname(__DIR__, 2) . '/budget-config.php';

    foreach ($candidates as $path) {
        if (is_file($path)) {
            $loaded = require $path;
            if (!is_array($loaded)) {
                throw new RuntimeException('budget-config.php must return an array.');
            }

            $config = $loaded;
            return $config;
        }
    }

    throw new RuntimeException('budget-config.php was not found.');
}

function budget_pdo(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = budget_config();
    $db = $config['db'] ?? [];
    foreach (['host', 'name', 'user', 'password'] as $key) {
        if (!isset($db[$key]) || !is_string($db[$key]) || $db[$key] === '') {
            throw new RuntimeException("Database config db.$key is required.");
        }
    }

    $charset = $db['charset'] ?? 'utf8mb4';
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $db['host'],
        $db['name'],
        $charset
    );

    $pdo = new PDO($dsn, $db['user'], $db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function budget_no_store_headers(): void
{
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
}

function budget_json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    budget_no_store_headers();
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function budget_json_error(string $message, int $status = 400, array $extra = []): void
{
    budget_json_response(['error' => $message] + $extra, $status);
}

function budget_handle_exception(Throwable $exception): void
{
    $status = $exception instanceof InvalidArgumentException ? 400 : 500;
    budget_json_error($exception->getMessage(), $status);
}

function budget_require_method(array $allowed): string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $allowed, true)) {
        header('Allow: ' . implode(', ', $allowed));
        budget_json_error('Method not allowed.', 405);
    }

    return $method;
}

function budget_request_data(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new InvalidArgumentException('Request JSON is invalid.');
        }

        return $decoded;
    }

    if ($_POST !== []) {
        return $_POST;
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    parse_str($raw, $data);
    return is_array($data) ? $data : [];
}

function budget_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $config = budget_config();
    $sessionName = $config['session_name'] ?? 'budget_admin';
    if (!is_string($sessionName) || $sessionName === '') {
        $sessionName = 'budget_admin';
    }

    session_name($sessionName);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (bool)($config['cookie_secure'] ?? true),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function budget_is_admin(): bool
{
    budget_start_session();
    return ($_SESSION['budget_admin_authenticated'] ?? false) === true;
}

function budget_require_admin(): void
{
    if (!budget_is_admin()) {
        budget_json_error('Login is required.', 401);
    }
}

function budget_csrf_token(): string
{
    budget_start_session();
    $token = $_SESSION['budget_csrf_token'] ?? null;
    if (!is_string($token) || $token === '') {
        $token = bin2hex(random_bytes(32));
        $_SESSION['budget_csrf_token'] = $token;
    }

    return $token;
}

function budget_require_csrf(): void
{
    budget_start_session();
    $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $token = is_string($header) ? $header : '';
    $expected = $_SESSION['budget_csrf_token'] ?? '';

    if (!is_string($expected) || $expected === '' || !hash_equals($expected, $token)) {
        budget_json_error('CSRF token is invalid.', 403);
    }
}

function budget_int_param(string $name, int $default, int $min, int $max): int
{
    $raw = $_GET[$name] ?? null;
    if ($raw === null || $raw === '') {
        return $default;
    }

    if (!is_scalar($raw) || !preg_match('/^-?\d+$/', (string)$raw)) {
        throw new InvalidArgumentException("$name must be an integer.");
    }

    $value = (int)$raw;
    if ($value < $min) {
        return $min;
    }

    if ($value > $max) {
        return $max;
    }

    return $value;
}

function budget_required_id(?string $raw): int
{
    if ($raw === null || $raw === '' || !preg_match('/^\d+$/', $raw)) {
        throw new InvalidArgumentException('A valid id is required.');
    }

    $id = (int)$raw;
    if ($id < 1) {
        throw new InvalidArgumentException('A valid id is required.');
    }

    return $id;
}

function budget_clean_text($value, int $maxLength, string $field): string
{
    if (!is_scalar($value)) {
        throw new InvalidArgumentException("$field must be text.");
    }

    $text = trim((string)$value);
    if ($text !== '' && preg_match('//u', $text) !== 1) {
        throw new InvalidArgumentException("$field must be UTF-8 text.");
    }

    $length = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    if ($length > $maxLength) {
        throw new InvalidArgumentException("$field is too long.");
    }

    return $text;
}

function budget_optional_date_param(string $name): ?string
{
    $raw = $_GET[$name] ?? '';
    if (!is_string($raw) || $raw === '') {
        return null;
    }

    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $raw, $m)) {
        throw new InvalidArgumentException("$name must be YYYY-MM-DD.");
    }

    if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        throw new InvalidArgumentException("$name is not a valid date.");
    }

    return $raw;
}

function budget_like_pattern(string $value): string
{
    $limited = budget_clean_text($value, 80, 'q');
    return '%' . strtr($limited, [
        '\\' => '\\\\',
        '%' => '\\%',
        '_' => '\\_',
    ]) . '%';
}

function budget_amount_basis(): array
{
    $basis = $_GET['amount_basis'] ?? 'budget';
    if (!is_string($basis)) {
        $basis = 'budget';
    }

    $map = [
        'budget' => ['t.budget_date', 't.budget_amount'],
        'usage' => ['t.used_on', 't.usage_amount'],
        'billing' => ['t.statement_payment_on', 't.billing_amount'],
    ];

    if (!isset($map[$basis])) {
        throw new InvalidArgumentException('amount_basis is invalid.');
    }

    return [$basis, $map[$basis][0], $map[$basis][1]];
}

function budget_transaction_filter_sql(array &$params, bool $includeDeleted, string $dateColumn): array
{
    $joins = ['JOIN imports i ON i.id = t.import_id'];
    $where = [];

    if (!$includeDeleted) {
        $where[] = 't.deleted_at IS NULL';
        $where[] = 't.superseded_at IS NULL';
        $where[] = 'i.deleted_at IS NULL';
    }

    $query = $_GET['q'] ?? '';
    if (is_string($query) && trim($query) !== '') {
        $where[] = "t.merchant LIKE ? ESCAPE '\\\\'";
        $params[] = budget_like_pattern($query);
    }

    $dateFrom = budget_optional_date_param('date_from');
    if ($dateFrom !== null) {
        $where[] = "$dateColumn >= ?";
        $params[] = $dateFrom;
    }

    $dateTo = budget_optional_date_param('date_to');
    if ($dateTo !== null) {
        $where[] = "$dateColumn <= ?";
        $params[] = $dateTo;
    }

    return [$joins, $where];
}

function budget_parse_csv_date(string $value, string $field, int $line): string
{
    $value = trim($value);
    if (!preg_match('/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/', $value, $m)) {
        throw new InvalidArgumentException("$field on line $line must be a date.");
    }

    $year = (int)$m[1];
    $month = (int)$m[2];
    $day = (int)$m[3];
    if (!checkdate($month, $day, $year)) {
        throw new InvalidArgumentException("$field on line $line is invalid.");
    }

    return sprintf('%04d-%02d-%02d', $year, $month, $day);
}

function budget_parse_csv_amount(string $value, string $field, int $line): int
{
    $value = str_replace([',', ' ', "\t"], '', trim($value));
    if ($value === '' || !preg_match('/^-?\d+$/', $value)) {
        throw new InvalidArgumentException("$field on line $line must be an integer amount.");
    }

    return (int)$value;
}

function budget_hash(array $fields): string
{
    $json = json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        throw new InvalidArgumentException('CSV row contains invalid UTF-8.');
    }

    return hash('sha256', $json);
}

function budget_normalize_csv_header(string $header): string
{
    $header = str_replace("\xEF\xBB\xBF", '', $header);
    $header = preg_replace('/^\x{FEFF}/u', '', $header);
    if (!is_string($header)) {
        throw new InvalidArgumentException('CSV header contains invalid UTF-8.');
    }

    $header = trim($header);
    if (strlen($header) >= 2 && $header[0] === '"' && substr($header, -1) === '"') {
        $header = substr($header, 1, -1);
    }

    return trim($header);
}

function budget_normalize_csv_row(array $row, int $line): array
{
    $usedOn = budget_parse_csv_date($row['利用日/キャンセル日'], '利用日/キャンセル日', $line);
    $statementPaymentOn = budget_parse_csv_date($row['当月お支払日'], '当月お支払日', $line);
    $merchant = budget_clean_text($row['利用店名・商品名'], 255, "利用店名・商品名 on line $line");
    $cardUser = budget_clean_text($row['利用者'], 100, "利用者 on line $line");
    $paymentMethod = budget_clean_text($row['決済方法'], 100, "決済方法 on line $line");
    $paymentCategory = budget_clean_text($row['支払区分'], 100, "支払区分 on line $line");

    if ($merchant === '') {
        throw new InvalidArgumentException("利用店名・商品名 on line $line is required.");
    }

    $usageAmount = budget_parse_csv_amount($row['利用金額'], '利用金額', $line);
    $feeAmount = budget_parse_csv_amount($row['手数料'], '手数料', $line);
    $totalAmount = budget_parse_csv_amount($row['支払総額'], '支払総額', $line);
    $billingAmount = budget_parse_csv_amount($row['当月支払金額'], '当月支払金額', $line);
    $carriedForwardAmount = budget_parse_csv_amount($row['翌月以降繰越金額'], '翌月以降繰越金額', $line);
    $adjustmentAmount = budget_parse_csv_amount($row['調整額'], '調整額', $line);

    if ($paymentCategory === '1回') {
        $budgetDate = $usedOn;
        $budgetAmount = $usageAmount;
    } else {
        $budgetDate = $statementPaymentOn;
        $budgetAmount = $billingAmount;
    }

    $normalized = [
        'used_on' => $usedOn,
        'merchant' => $merchant,
        'card_user' => $cardUser,
        'payment_method' => $paymentMethod,
        'payment_category' => $paymentCategory,
        'usage_amount' => $usageAmount,
        'fee_amount' => $feeAmount,
        'total_amount' => $totalAmount,
        'billing_amount' => $billingAmount,
        'carried_forward_amount' => $carriedForwardAmount,
        'adjustment_amount' => $adjustmentAmount,
        'statement_payment_on' => $statementPaymentOn,
        'budget_date' => $budgetDate,
        'budget_amount' => $budgetAmount,
    ];

    $identityFields = [
        'used_on' => $usedOn,
        'merchant' => $merchant,
        'card_user' => $cardUser,
        'payment_method' => $paymentMethod,
        'payment_category' => $paymentCategory,
        'usage_amount' => $usageAmount,
        'fee_amount' => $feeAmount,
        'total_amount' => $totalAmount,
    ];

    return [
        'fields' => $normalized,
        'identity_hash' => budget_hash($identityFields),
        'content_hash' => budget_hash($normalized),
        'raw' => $row,
        'source_row_number' => $line,
    ];
}

function budget_parse_csv_file(string $path, int $maxRows = 5000): array
{
    $handle = fopen($path, 'rb');
    if ($handle === false) {
        throw new InvalidArgumentException('CSV file cannot be opened.');
    }

    try {
        $headers = fgetcsv($handle);
        if (!is_array($headers)) {
            throw new InvalidArgumentException('CSV header is missing.');
        }

        $headerMap = [];
        foreach ($headers as $index => $header) {
            $header = budget_normalize_csv_header((string)$header);
            if ($header === '') {
                continue;
            }

            if (isset($headerMap[$header])) {
                throw new InvalidArgumentException("CSV header $header is duplicated.");
            }

            $headerMap[$header] = $index;
        }

        foreach (BUDGET_REQUIRED_HEADERS as $requiredHeader) {
            if (!array_key_exists($requiredHeader, $headerMap)) {
                $detected = implode(', ', array_slice(array_keys($headerMap), 0, 8));
                throw new InvalidArgumentException("CSV header $requiredHeader is required. Detected headers: $detected");
            }
        }

        $rows = [];
        $statementPaymentOn = null;
        $occurrences = [];
        $line = 1;

        while (($data = fgetcsv($handle)) !== false) {
            $line++;
            if ($data === [null] || $data === ['']) {
                continue;
            }

            if (count($rows) >= $maxRows) {
                throw new InvalidArgumentException("CSV row limit is $maxRows.");
            }

            $row = [];
            foreach (BUDGET_REQUIRED_HEADERS as $header) {
                $index = $headerMap[$header];
                $row[$header] = isset($data[$index]) ? (string)$data[$index] : '';
            }

            $normalized = budget_normalize_csv_row($row, $line);
            $rowPaymentOn = $normalized['fields']['statement_payment_on'];
            if ($statementPaymentOn === null) {
                $statementPaymentOn = $rowPaymentOn;
            } elseif ($statementPaymentOn !== $rowPaymentOn) {
                throw new InvalidArgumentException('CSV must contain only one 当月お支払日.');
            }

            $identityHash = $normalized['identity_hash'];
            $occurrences[$identityHash] = ($occurrences[$identityHash] ?? 0) + 1;
            $normalized['occurrence_no'] = $occurrences[$identityHash];
            $rows[] = $normalized;
        }

        if ($rows === [] || $statementPaymentOn === null) {
            throw new InvalidArgumentException('CSV has no transaction rows.');
        }

        return [
            'statement_payment_on' => $statementPaymentOn,
            'rows' => $rows,
        ];
    } finally {
        fclose($handle);
    }
}

function budget_safe_upload_name(string $name): string
{
    $name = basename($name);
    $name = trim($name);
    if ($name === '') {
        return 'uploaded.csv';
    }

    if (function_exists('mb_strlen') && mb_strlen($name, 'UTF-8') > 255) {
        return mb_substr($name, 0, 255, 'UTF-8');
    }

    return strlen($name) > 255 ? substr($name, 0, 255) : $name;
}

function budget_import_csv(PDO $pdo, string $path, string $originalName): array
{
    $parsed = budget_parse_csv_file($path);
    $sourceName = budget_safe_upload_name($originalName);

    $inserted = 0;
    $updated = 0;
    $unchanged = 0;
    $superseded = 0;
    $currentKeys = [];

    $pdo->beginTransaction();

    try {
        $insertImport = $pdo->prepare(
            'INSERT INTO imports
                (statement_payment_on, source_filename, row_count, inserted_count, updated_count, unchanged_count, superseded_count)
             VALUES (?, ?, ?, 0, 0, 0, 0)'
        );
        $insertImport->execute([
            $parsed['statement_payment_on'],
            $sourceName,
            count($parsed['rows']),
        ]);
        $importId = (int)$pdo->lastInsertId();

        $selectTransaction = $pdo->prepare(
            'SELECT id, content_hash
             FROM transactions
             WHERE statement_payment_on = ?
               AND identity_hash = ?
               AND occurrence_no = ?
             FOR UPDATE'
        );

        $insertTransaction = $pdo->prepare(
            'INSERT INTO transactions
                (import_id, statement_payment_on, used_on, merchant, card_user, payment_method, payment_category,
                 usage_amount, fee_amount, total_amount, billing_amount, carried_forward_amount, adjustment_amount,
                 budget_date, budget_amount, identity_hash, content_hash, occurrence_no, raw_data_json, source_row_number)
             VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        $updateTransaction = $pdo->prepare(
            'UPDATE transactions
             SET import_id = ?,
                 used_on = ?,
                 merchant = ?,
                 card_user = ?,
                 payment_method = ?,
                 payment_category = ?,
                 usage_amount = ?,
                 fee_amount = ?,
                 total_amount = ?,
                 billing_amount = ?,
                 carried_forward_amount = ?,
                 adjustment_amount = ?,
                 budget_date = ?,
                 budget_amount = ?,
                 content_hash = ?,
                 raw_data_json = ?,
                 source_row_number = ?,
                 superseded_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );

        $touchTransaction = $pdo->prepare(
            'UPDATE transactions
             SET import_id = ?,
                 superseded_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );

        foreach ($parsed['rows'] as $row) {
            $fields = $row['fields'];
            $key = $row['identity_hash'] . ':' . $row['occurrence_no'];
            $currentKeys[$key] = true;

            $rawJson = json_encode($row['raw'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (!is_string($rawJson)) {
                throw new InvalidArgumentException('CSV row contains invalid UTF-8.');
            }

            $selectTransaction->execute([
                $fields['statement_payment_on'],
                $row['identity_hash'],
                $row['occurrence_no'],
            ]);
            $existing = $selectTransaction->fetch();

            if ($existing === false) {
                $insertTransaction->execute([
                    $importId,
                    $fields['statement_payment_on'],
                    $fields['used_on'],
                    $fields['merchant'],
                    $fields['card_user'],
                    $fields['payment_method'],
                    $fields['payment_category'],
                    $fields['usage_amount'],
                    $fields['fee_amount'],
                    $fields['total_amount'],
                    $fields['billing_amount'],
                    $fields['carried_forward_amount'],
                    $fields['adjustment_amount'],
                    $fields['budget_date'],
                    $fields['budget_amount'],
                    $row['identity_hash'],
                    $row['content_hash'],
                    $row['occurrence_no'],
                    $rawJson,
                    $row['source_row_number'],
                ]);
                $inserted++;
                continue;
            }

            $transactionId = (int)$existing['id'];
            if ((string)$existing['content_hash'] === $row['content_hash']) {
                $touchTransaction->execute([$importId, $transactionId]);
                $unchanged++;
                continue;
            }

            $updateTransaction->execute([
                $importId,
                $fields['used_on'],
                $fields['merchant'],
                $fields['card_user'],
                $fields['payment_method'],
                $fields['payment_category'],
                $fields['usage_amount'],
                $fields['fee_amount'],
                $fields['total_amount'],
                $fields['billing_amount'],
                $fields['carried_forward_amount'],
                $fields['adjustment_amount'],
                $fields['budget_date'],
                $fields['budget_amount'],
                $row['content_hash'],
                $rawJson,
                $row['source_row_number'],
                $transactionId,
            ]);
            $updated++;
        }

        $selectExisting = $pdo->prepare(
            'SELECT id, identity_hash, occurrence_no
             FROM transactions
             WHERE statement_payment_on = ?
             FOR UPDATE'
        );
        $selectExisting->execute([$parsed['statement_payment_on']]);
        $markSuperseded = $pdo->prepare(
            'UPDATE transactions
             SET superseded_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND superseded_at IS NULL'
        );

        foreach ($selectExisting->fetchAll() as $existingRow) {
            $key = $existingRow['identity_hash'] . ':' . $existingRow['occurrence_no'];
            if (!isset($currentKeys[$key])) {
                $markSuperseded->execute([(int)$existingRow['id']]);
                $superseded += $markSuperseded->rowCount();
            }
        }

        $updateImport = $pdo->prepare(
            'UPDATE imports
             SET inserted_count = ?,
                 updated_count = ?,
                 unchanged_count = ?,
                 superseded_count = ?
             WHERE id = ?'
        );
        $updateImport->execute([$inserted, $updated, $unchanged, $superseded, $importId]);

        $pdo->commit();

        return [
            'id' => $importId,
            'statement_payment_on' => $parsed['statement_payment_on'],
            'row_count' => count($parsed['rows']),
            'inserted_count' => $inserted,
            'updated_count' => $updated,
            'unchanged_count' => $unchanged,
            'superseded_count' => $superseded,
        ];
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}
