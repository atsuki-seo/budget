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
    '当月支払金額',
    '翌月以降繰越金額',
    '調整額',
    '当月お支払日',
];

const BUDGET_BANK_REQUIRED_HEADERS = [
    '操作日(年)',
    '操作日(月)',
    '操作日(日)',
    '操作時刻(時)',
    '操作時刻(分)',
    '操作時刻(秒)',
    '取引順番号',
    '摘要',
    'お支払金額',
    'お預り金額',
    '残高',
    'メモ',
];

const BUDGET_CARD_PAYMENT_METHODS = [
    'Apple Pay',
    'Apple Pay QUICPay',
    'Apple Pay タッチ決済',
    'PayPayカード ゴールド',
    'PayPayクレジット',
    'タッチ決済',
];

const BUDGET_PAYMENT_METHODS = [
    'Apple Pay',
    'Apple Pay QUICPay',
    'Apple Pay タッチ決済',
    'PayPayカード ゴールド',
    'PayPayクレジット',
    'タッチ決済',
    '銀行口座',
    '現金',
];

const BUDGET_INSTALLMENT_COUNTS = [
    2,
    3,
    5,
    6,
    10,
    12,
    15,
    18,
    20,
    24,
    30,
    36,
    48,
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

function budget_trim_import_text(string $text): string
{
    $trimmed = preg_replace('/^[\s\x{3000}]+|[\s\x{3000}]+$/u', '', $text);
    if (!is_string($trimmed)) {
        throw new InvalidArgumentException('Imported text must be UTF-8 text.');
    }

    return $trimmed;
}

function budget_payment_import_exclusion_merchants(): array
{
    static $exclusions = null;

    if ($exclusions !== null) {
        return $exclusions;
    }

    $path = __DIR__ . '/payment_import_exclusions.php';
    $loaded = is_file($path) ? require $path : [];
    if (!is_array($loaded)) {
        throw new RuntimeException('payment_import_exclusions.php must return an array.');
    }

    $merchants = $loaded['bank_merchant_exact'] ?? [];
    if (!is_array($merchants)) {
        throw new RuntimeException('payment_import_exclusions.php bank_merchant_exact must be an array.');
    }

    $exclusions = [];
    foreach ($merchants as $merchant) {
        if (!is_scalar($merchant)) {
            throw new RuntimeException('payment_import_exclusions.php bank_merchant_exact values must be text.');
        }

        $merchant = budget_trim_import_text((string)$merchant);
        if ($merchant !== '') {
            $exclusions[$merchant] = true;
        }
    }

    return $exclusions;
}

function budget_is_payment_import_merchant_excluded(string $merchant): bool
{
    return isset(budget_payment_import_exclusion_merchants()[$merchant]);
}

function budget_parse_manual_date($value, string $field): string
{
    if (!is_scalar($value)) {
        throw new InvalidArgumentException("$field must be YYYY-MM-DD.");
    }

    $value = trim((string)$value);
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
        throw new InvalidArgumentException("$field must be YYYY-MM-DD.");
    }

    if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        throw new InvalidArgumentException("$field is not a valid date.");
    }

    return $value;
}

function budget_parse_manual_amount($value, string $field): int
{
    if (!is_scalar($value)) {
        throw new InvalidArgumentException("$field must be an integer amount.");
    }

    $amount = str_replace([',', ' ', '　', "\t", "\r", "\n"], '', trim((string)$value));
    if ($amount === '' || !preg_match('/^\d+$/', $amount)) {
        throw new InvalidArgumentException("$field must be an integer amount.");
    }

    $amount = ltrim($amount, '0');
    if ($amount === '') {
        throw new InvalidArgumentException("$field must be greater than 0.");
    }

    if (strlen($amount) > 10 || (strlen($amount) === 10 && strcmp($amount, '2147483647') > 0)) {
        throw new InvalidArgumentException("$field is too large.");
    }

    return (int)$amount;
}

function budget_is_card_payment_method(string $paymentMethod): bool
{
    return in_array($paymentMethod, BUDGET_CARD_PAYMENT_METHODS, true);
}

function budget_normalize_manual_payment_category($value): string
{
    $paymentCategory = budget_clean_text($value, 100, '支払区分');
    if ($paymentCategory === '1回') {
        return $paymentCategory;
    }

    if (!preg_match('/^均等 ([1-9]\d*)／([1-9]\d*)$/u', $paymentCategory, $m)) {
        throw new InvalidArgumentException('支払区分 is invalid.');
    }

    $installmentNumber = (int)$m[1];
    $installmentCount = (int)$m[2];
    if (!in_array($installmentCount, BUDGET_INSTALLMENT_COUNTS, true)) {
        throw new InvalidArgumentException('分割回数 is invalid.');
    }

    if ($installmentNumber < 1 || $installmentNumber > $installmentCount) {
        throw new InvalidArgumentException('何回目 must be within 分割回数.');
    }

    return $paymentCategory;
}

function budget_normalize_manual_transaction(array $data): array
{
    $usedOn = budget_parse_manual_date($data['used_on'] ?? '', '利用日');
    $merchant = budget_clean_text($data['merchant'] ?? '', 255, '店名・商品名');
    if ($merchant === '') {
        throw new InvalidArgumentException('店名・商品名 is required.');
    }

    $paymentMethod = budget_clean_text($data['payment_method'] ?? '', 100, '決済方法');
    if (!in_array($paymentMethod, BUDGET_PAYMENT_METHODS, true)) {
        throw new InvalidArgumentException('決済方法 is invalid.');
    }

    $amount = budget_parse_manual_amount($data['amount'] ?? '', '金額');
    if (budget_is_card_payment_method($paymentMethod)) {
        $statementPaymentOn = budget_parse_manual_date($data['statement_payment_on'] ?? '', '当月お支払日');
        $paymentCategory = budget_normalize_manual_payment_category($data['payment_category'] ?? '');
    } else {
        $statementPaymentOn = $usedOn;
        $paymentCategory = '1回';
    }

    return [
        'statement_payment_on' => $statementPaymentOn,
        'used_on' => $usedOn,
        'merchant' => $merchant,
        'card_user' => '本人',
        'payment_method' => $paymentMethod,
        'payment_category' => $paymentCategory,
        'usage_amount' => $amount,
        'billing_amount' => $amount,
        'carried_forward_amount' => 0,
        'adjustment_amount' => 0,
    ];
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

function budget_transaction_filter_sql(array &$params): array
{
    $where = [];

    $dateFrom = budget_optional_date_param('date_from');
    if ($dateFrom !== null) {
        $where[] = 't.statement_payment_on >= ?';
        $params[] = $dateFrom;
    }

    $dateTo = budget_optional_date_param('date_to');
    if ($dateTo !== null) {
        $where[] = 't.statement_payment_on <= ?';
        $params[] = $dateTo;
    }

    return $where;
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

function budget_try_normalize_csv_header(string $header): ?string
{
    $header = str_replace("\xEF\xBB\xBF", '', $header);
    $header = preg_replace('/^\x{FEFF}/u', '', $header);
    if (!is_string($header)) {
        return null;
    }

    $header = trim($header);
    if (strlen($header) >= 2 && $header[0] === '"' && substr($header, -1) === '"') {
        $header = substr($header, 1, -1);
    }

    return trim($header);
}

function budget_normalize_csv_header(string $header): string
{
    $normalized = budget_try_normalize_csv_header($header);
    if ($normalized === null) {
        throw new InvalidArgumentException('CSV header contains invalid UTF-8.');
    }

    return $normalized;
}

function budget_csv_contents_handle(string $contents)
{
    $handle = fopen('php://temp', 'r+b');
    if ($handle === false) {
        throw new RuntimeException('CSV buffer cannot be opened.');
    }

    if (fwrite($handle, $contents) === false) {
        fclose($handle);
        throw new RuntimeException('CSV buffer cannot be written.');
    }

    rewind($handle);
    return $handle;
}

function budget_csv_header_map(array $headers): ?array
{
    $headerMap = [];
    foreach ($headers as $index => $header) {
        $header = budget_try_normalize_csv_header((string)$header);
        if ($header === null) {
            return null;
        }

        if ($header === '') {
            continue;
        }

        if (isset($headerMap[$header])) {
            throw new InvalidArgumentException("CSV header $header is duplicated.");
        }

        $headerMap[$header] = $index;
    }

    return $headerMap;
}

function budget_csv_has_required_headers(array $headerMap, array $requiredHeaders): bool
{
    foreach ($requiredHeaders as $requiredHeader) {
        if (!array_key_exists($requiredHeader, $headerMap)) {
            return false;
        }
    }

    return true;
}

function budget_csv_required_row(array $data, array $headerMap, array $requiredHeaders): array
{
    $row = [];
    foreach ($requiredHeaders as $header) {
        $index = $headerMap[$header];
        $row[$header] = isset($data[$index]) ? (string)$data[$index] : '';
    }

    return $row;
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
    $billingAmount = budget_parse_csv_amount($row['当月支払金額'], '当月支払金額', $line);
    $carriedForwardAmount = budget_parse_csv_amount($row['翌月以降繰越金額'], '翌月以降繰越金額', $line);
    $adjustmentAmount = budget_parse_csv_amount($row['調整額'], '調整額', $line);

    $normalized = [
        'statement_payment_on' => $statementPaymentOn,
        'used_on' => $usedOn,
        'merchant' => $merchant,
        'card_user' => $cardUser,
        'payment_method' => $paymentMethod,
        'payment_category' => $paymentCategory,
        'usage_amount' => $usageAmount,
        'billing_amount' => $billingAmount,
        'carried_forward_amount' => $carriedForwardAmount,
        'adjustment_amount' => $adjustmentAmount,
    ];

    return [
        'fields' => $normalized,
    ];
}

function budget_parse_bank_csv_number(string $value, string $field, int $line, int $min, int $max): int
{
    $value = trim($value);
    if ($value === '' || !preg_match('/^\d+$/', $value)) {
        throw new InvalidArgumentException("$field on line $line must be an integer.");
    }

    $number = (int)$value;
    if ($number < $min || $number > $max) {
        throw new InvalidArgumentException("$field on line $line is invalid.");
    }

    return $number;
}

function budget_parse_bank_csv_date(array $row, int $line): string
{
    $year = budget_parse_bank_csv_number($row['操作日(年)'], '操作日(年)', $line, 1000, 9999);
    $month = budget_parse_bank_csv_number($row['操作日(月)'], '操作日(月)', $line, 1, 12);
    $day = budget_parse_bank_csv_number($row['操作日(日)'], '操作日(日)', $line, 1, 31);

    if (!checkdate($month, $day, $year)) {
        throw new InvalidArgumentException("操作日 on line $line is invalid.");
    }

    return sprintf('%04d-%02d-%02d', $year, $month, $day);
}

function budget_validate_bank_csv_time(array $row, int $line): void
{
    budget_parse_bank_csv_number($row['操作時刻(時)'], '操作時刻(時)', $line, 0, 23);
    budget_parse_bank_csv_number($row['操作時刻(分)'], '操作時刻(分)', $line, 0, 59);
    budget_parse_bank_csv_number($row['操作時刻(秒)'], '操作時刻(秒)', $line, 0, 59);
}

function budget_normalize_bank_csv_row(array $row, int $line, string $usedOn): ?array
{
    if (trim($row['お支払金額']) === '') {
        return null;
    }

    $amount = budget_parse_csv_amount($row['お支払金額'], 'お支払金額', $line);
    if ($amount <= 0) {
        throw new InvalidArgumentException("お支払金額 on line $line must be greater than 0.");
    }

    $merchant = budget_clean_text(budget_trim_import_text($row['摘要']), 255, "摘要 on line $line");
    if ($merchant === '') {
        throw new InvalidArgumentException("摘要 on line $line is required.");
    }

    if (budget_is_payment_import_merchant_excluded($merchant)) {
        return null;
    }

    return [
        'fields' => [
            'statement_payment_on' => $usedOn,
            'used_on' => $usedOn,
            'merchant' => $merchant,
            'card_user' => '本人',
            'payment_method' => '銀行口座',
            'payment_category' => '1回',
            'usage_amount' => $amount,
            'billing_amount' => $amount,
            'carried_forward_amount' => 0,
            'adjustment_amount' => 0,
        ],
    ];
}

function budget_parse_card_csv_contents(string $contents, int $maxRows): ?array
{
    $handle = budget_csv_contents_handle($contents);

    try {
        $headers = fgetcsv($handle);
        if (!is_array($headers)) {
            return null;
        }

        $headerMap = budget_csv_header_map($headers);
        if ($headerMap === null || !budget_csv_has_required_headers($headerMap, BUDGET_REQUIRED_HEADERS)) {
            return null;
        }

        $rows = [];
        $statementPaymentOn = null;
        $line = 1;

        while (($data = fgetcsv($handle)) !== false) {
            $line++;
            if ($data === [null] || $data === ['']) {
                continue;
            }

            if (count($rows) >= $maxRows) {
                throw new InvalidArgumentException("CSV row limit is $maxRows.");
            }

            $row = budget_csv_required_row($data, $headerMap, BUDGET_REQUIRED_HEADERS);
            $normalized = budget_normalize_csv_row($row, $line);
            $rowPaymentOn = $normalized['fields']['statement_payment_on'];
            if ($statementPaymentOn === null) {
                $statementPaymentOn = $rowPaymentOn;
            } elseif ($statementPaymentOn !== $rowPaymentOn) {
                throw new InvalidArgumentException('CSV must contain only one 当月お支払日.');
            }

            $rows[] = $normalized;
        }

        if ($rows === [] || $statementPaymentOn === null) {
            throw new InvalidArgumentException('CSV has no transaction rows.');
        }

        return [
            'source_type' => 'csv',
            'statement_payment_on' => $statementPaymentOn,
            'date_from' => $statementPaymentOn,
            'date_to' => $statementPaymentOn,
            'rows' => $rows,
        ];
    } finally {
        fclose($handle);
    }
}

function budget_parse_bank_csv_contents(string $contents, int $maxRows): ?array
{
    $handle = budget_csv_contents_handle($contents);

    try {
        $headers = fgetcsv($handle);
        if (!is_array($headers)) {
            return null;
        }

        $headerMap = budget_csv_header_map($headers);
        if ($headerMap === null || !budget_csv_has_required_headers($headerMap, BUDGET_BANK_REQUIRED_HEADERS)) {
            return null;
        }

        $rows = [];
        $dateFrom = null;
        $dateTo = null;
        $line = 1;

        while (($data = fgetcsv($handle)) !== false) {
            $line++;
            if ($data === [null] || $data === ['']) {
                continue;
            }

            if ($line - 1 > $maxRows) {
                throw new InvalidArgumentException("CSV row limit is $maxRows.");
            }

            $row = budget_csv_required_row($data, $headerMap, BUDGET_BANK_REQUIRED_HEADERS);
            $usedOn = budget_parse_bank_csv_date($row, $line);
            budget_validate_bank_csv_time($row, $line);

            if ($dateFrom === null || $usedOn < $dateFrom) {
                $dateFrom = $usedOn;
            }
            if ($dateTo === null || $usedOn > $dateTo) {
                $dateTo = $usedOn;
            }

            $normalized = budget_normalize_bank_csv_row($row, $line, $usedOn);
            if ($normalized !== null) {
                $rows[] = $normalized;
            }
        }

        if ($dateFrom === null || $dateTo === null) {
            throw new InvalidArgumentException('CSV has no transaction rows.');
        }

        return [
            'source_type' => 'bank_csv',
            'statement_payment_on' => $dateTo,
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'rows' => $rows,
        ];
    } finally {
        fclose($handle);
    }
}

function budget_parse_csv_file(string $path, int $maxRows = 5000): array
{
    $contents = file_get_contents($path);
    if ($contents === false) {
        throw new InvalidArgumentException('CSV file cannot be opened.');
    }

    $parsed = budget_parse_card_csv_contents($contents, $maxRows);
    if ($parsed !== null) {
        return $parsed;
    }

    $converted = @iconv('CP932', 'UTF-8', $contents);
    if (is_string($converted)) {
        $parsed = budget_parse_bank_csv_contents($converted, $maxRows);
        if ($parsed !== null) {
            return $parsed;
        }
    }

    throw new InvalidArgumentException('CSV header is unsupported.');
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

    $pdo->beginTransaction();

    try {
        if ($parsed['source_type'] === 'bank_csv') {
            $deleteBankTransactions = $pdo->prepare(
                "DELETE t
                 FROM transactions t
                 INNER JOIN imports i ON i.id = t.import_id
                 WHERE i.source_type = 'bank_csv'
                   AND t.used_on BETWEEN ? AND ?"
            );
            $deleteBankTransactions->execute([$parsed['date_from'], $parsed['date_to']]);

            $deleteEmptyBankImports = $pdo->prepare(
                "DELETE i
                 FROM imports i
                 LEFT JOIN transactions t ON t.import_id = i.id
                 WHERE i.source_type = 'bank_csv'
                   AND t.id IS NULL"
            );
            $deleteEmptyBankImports->execute();

            $updateBankImportCounts = $pdo->prepare(
                "UPDATE imports i
                 SET row_count = (
                     SELECT COUNT(*)
                     FROM transactions t
                     WHERE t.import_id = i.id
                 )
                 WHERE i.source_type = 'bank_csv'"
            );
            $updateBankImportCounts->execute();

            $deleteManualBankImports = $pdo->prepare(
                "DELETE i
                 FROM imports i
                 INNER JOIN transactions t ON t.import_id = i.id
                 WHERE i.source_type = 'manual'
                   AND t.payment_method = '銀行口座'
                   AND t.used_on BETWEEN ? AND ?"
            );
            $deleteManualBankImports->execute([$parsed['date_from'], $parsed['date_to']]);
        } else {
            $deleteCsvImports = $pdo->prepare(
                "DELETE FROM imports
                 WHERE statement_payment_on = ?
                   AND source_type = 'csv'"
            );
            $deleteCsvImports->execute([$parsed['statement_payment_on']]);

            $cardMethodPlaceholders = implode(', ', array_fill(0, count(BUDGET_CARD_PAYMENT_METHODS), '?'));
            $deleteCardManualImports = $pdo->prepare(
                "DELETE i
                 FROM imports i
                 INNER JOIN transactions t ON t.import_id = i.id
                 WHERE i.statement_payment_on = ?
                   AND i.source_type = 'manual'
                   AND t.payment_method IN ($cardMethodPlaceholders)"
            );
            $deleteCardManualImports->execute(array_merge(
                [$parsed['statement_payment_on']],
                BUDGET_CARD_PAYMENT_METHODS
            ));
        }

        $insertImport = $pdo->prepare(
            'INSERT INTO imports
                (source_type, statement_payment_on, source_filename, row_count)
             VALUES (?, ?, ?, ?)'
        );
        $insertImport->execute([
            $parsed['source_type'],
            $parsed['statement_payment_on'],
            $sourceName,
            count($parsed['rows']),
        ]);
        $importId = (int)$pdo->lastInsertId();

        $insertTransaction = $pdo->prepare(
            'INSERT INTO transactions
                (import_id, statement_payment_on, used_on, merchant, card_user, payment_method, payment_category,
                 usage_amount, billing_amount, carried_forward_amount, adjustment_amount)
             VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        foreach ($parsed['rows'] as $row) {
            $fields = $row['fields'];
            $insertTransaction->execute([
                $importId,
                $fields['statement_payment_on'],
                $fields['used_on'],
                $fields['merchant'],
                $fields['card_user'],
                $fields['payment_method'],
                $fields['payment_category'],
                $fields['usage_amount'],
                $fields['billing_amount'],
                $fields['carried_forward_amount'],
                $fields['adjustment_amount'],
            ]);
        }

        $pdo->commit();

        return [
            'id' => $importId,
            'source_type' => $parsed['source_type'],
            'statement_payment_on' => $parsed['statement_payment_on'],
            'row_count' => count($parsed['rows']),
        ];
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

function budget_create_manual_transaction(PDO $pdo, array $data): array
{
    $fields = budget_normalize_manual_transaction($data);

    $pdo->beginTransaction();

    try {
        $insertImport = $pdo->prepare(
            'INSERT INTO imports
                (source_type, statement_payment_on, source_filename, row_count)
             VALUES (?, ?, ?, ?)'
        );
        $insertImport->execute([
            'manual',
            $fields['statement_payment_on'],
            '手入力',
            1,
        ]);
        $importId = (int)$pdo->lastInsertId();

        $insertTransaction = $pdo->prepare(
            'INSERT INTO transactions
                (import_id, statement_payment_on, used_on, merchant, card_user, payment_method, payment_category,
                 usage_amount, billing_amount, carried_forward_amount, adjustment_amount)
             VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insertTransaction->execute([
            $importId,
            $fields['statement_payment_on'],
            $fields['used_on'],
            $fields['merchant'],
            $fields['card_user'],
            $fields['payment_method'],
            $fields['payment_category'],
            $fields['usage_amount'],
            $fields['billing_amount'],
            $fields['carried_forward_amount'],
            $fields['adjustment_amount'],
        ]);
        $transactionId = (int)$pdo->lastInsertId();

        $pdo->commit();

        return ['id' => $transactionId, 'import_id' => $importId] + $fields;
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}
