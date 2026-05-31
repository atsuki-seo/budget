<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/lib/app.php';

function test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: $message\n");
        exit(1);
    }
}

function test_csv_path(string $csv): string
{
    $path = tempnam(sys_get_temp_dir(), 'budget_csv_');
    if ($path === false) {
        fwrite(STDERR, "FAIL: tempnam failed\n");
        exit(1);
    }

    file_put_contents($path, $csv);
    return $path;
}

function test_parse(string $csv): array
{
    $path = test_csv_path($csv);
    try {
        return budget_parse_csv_file($path);
    } finally {
        unlink($path);
    }
}

function test_parse_cp932(string $csv): array
{
    $encoded = iconv('UTF-8', 'CP932', $csv);
    test_assert(is_string($encoded), 'CP932 test CSV is encoded');
    return test_parse($encoded);
}

function test_payment_exclusions_path(array $merchants): string
{
    $path = tempnam(sys_get_temp_dir(), 'budget_exclusions_');
    if ($path === false) {
        fwrite(STDERR, "FAIL: tempnam failed\n");
        exit(1);
    }

    $contents = "<?php\n\ndeclare(strict_types=1);\n\nreturn "
        . var_export(['bank_merchant_exact' => $merchants], true)
        . ";\n";
    file_put_contents($path, $contents);
    return $path;
}

function test_expect_invalid(string $csv, string $message): void
{
    try {
        test_parse($csv);
    } catch (InvalidArgumentException $exception) {
        return;
    }

    fwrite(STDERR, "FAIL: $message\n");
    exit(1);
}

$header = '"利用日/キャンセル日","利用店名・商品名","利用者","決済方法","支払区分","利用金額","手数料","支払総額","当月支払金額","翌月以降繰越金額","調整額","当月お支払日"' . "\n";

$parsed = test_parse("\xEF\xBB\xBF" . $header
    . '"2026/3/1","DUMMY_CARD_MERCHANT_A","本人","PayPayカード ゴールド","1回","111111","0","111111","111111","0","0","2026/4/27"' . "\n"
    . '"2026/3/2","DUMMY_CARD_MERCHANT_B","本人","PayPayカード ゴールド","均等 2／6","222222","0","222222","22222","200000","0","2026/4/27"' . "\n");

test_assert($parsed['statement_payment_on'] === '2026-04-27', 'statement payment date is normalized');
test_assert(count($parsed['rows']) === 2, 'BOM UTF-8 CSV rows are parsed');
test_assert($parsed['rows'][0]['fields']['transaction_type'] === 'expense', 'card CSV rows are expenses');
test_assert($parsed['rows'][0]['fields']['used_on'] === '2026-03-01', 'used date is normalized');
test_assert($parsed['rows'][0]['fields']['statement_payment_on'] === '2026-04-27', 'row statement payment date is normalized');
test_assert($parsed['rows'][0]['fields']['usage_amount'] === 111111, 'usage amount is parsed');
test_assert($parsed['rows'][1]['fields']['billing_amount'] === 22222, 'billing amount is parsed');
test_assert(!array_key_exists('fee_amount', $parsed['rows'][0]['fields']), 'fee amount is not returned');
test_assert(!array_key_exists('total_amount', $parsed['rows'][0]['fields']), 'total amount is not returned');
test_assert(!array_key_exists('budget_date', $parsed['rows'][0]['fields']), 'budget date is not returned');
test_assert(!array_key_exists('budget_amount', $parsed['rows'][0]['fields']), 'budget amount is not returned');

$withoutTotalHeader = '"利用日/キャンセル日","利用店名・商品名","利用者","決済方法","支払区分","利用金額","手数料","当月支払金額","翌月以降繰越金額","調整額","当月お支払日"' . "\n"
    . '"2026/3/1","DUMMY_CARD_MERCHANT_A","本人","PayPayカード ゴールド","1回","111111","0","111111","0","0","2026/4/27"' . "\n";
$withoutTotal = test_parse($withoutTotalHeader);
test_assert($withoutTotal['rows'][0]['fields']['billing_amount'] === 111111, 'total amount header is optional');

$missingHeader = '"利用日/キャンセル日","利用店名・商品名","利用者","決済方法","支払区分","利用金額","手数料","支払総額","当月支払金額","翌月以降繰越金額","当月お支払日"' . "\n"
    . '"2026/3/1","DUMMY_CARD_MERCHANT_A","本人","PayPayカード ゴールド","1回","111111","0","111111","111111","0","2026/4/27"' . "\n";
test_expect_invalid($missingHeader, 'missing required header is rejected');

$multiplePaymentDates = $header
    . '"2026/3/1","DUMMY_CARD_MERCHANT_A","本人","PayPayカード ゴールド","1回","111111","0","111111","111111","0","0","2026/4/27"' . "\n"
    . '"2026/3/2","DUMMY_CARD_MERCHANT_B","本人","PayPayカード ゴールド","1回","111111","0","111111","111111","0","0","2026/5/27"' . "\n";
test_expect_invalid($multiplePaymentDates, 'multiple statement payment dates are rejected');

$duplicates = test_parse($header
    . '"2026/3/1","DUMMY_CARD_MERCHANT_A","本人","PayPayカード ゴールド","1回","111111","0","111111","111111","0","0","2026/4/27"' . "\n"
    . '"2026/3/1","DUMMY_CARD_MERCHANT_A","本人","PayPayカード ゴールド","1回","111111","0","111111","111111","0","0","2026/4/27"' . "\n");

test_assert(count($duplicates['rows']) === 2, 'duplicate CSV rows are preserved');
test_assert(!array_key_exists('identity_hash', $duplicates['rows'][0]), 'identity hash is not returned');
test_assert(!array_key_exists('occurrence_no', $duplicates['rows'][0]), 'occurrence number is not returned');

$bankExclusionsPath = test_payment_exclusions_path([
    'DUMMY_EXCLUDED_INVESTMENT',
    'DUMMY_EXCLUDED_CARD_PAYMENT',
    'DUMMY_EXCLUDED_TRANSFER',
]);

$bankHeader = '"操作日(年)","操作日(月)","操作日(日)","操作時刻(時)","操作時刻(分)","操作時刻(秒)","取引順番号","摘要","お支払金額","お預り金額","残高","メモ"' . "\r\n";
putenv('BUDGET_PAYMENT_IMPORT_EXCLUSIONS_PATH=' . $bankExclusionsPath);
try {
    $bank = test_parse_cp932($bankHeader
        . '"2026","5","20","1","13","58","0000101","DUMMY_BANK_INCOME_SOURCE","","111111","900001",""' . "\r\n"
        . '"2026","5","27","1","36","23","0000101","DUMMY_BANK_EXPENSE_MERCHANT    ","22222","","877779",""' . "\r\n"
        . '"2026","5","27","1","40","0","0000201","DUMMY_EXCLUDED_INVESTMENT","33333","","844446",""' . "\r\n"
        . '"2026","5","27","1","46","6","0000301","DUMMY_EXCLUDED_CARD_PAYMENT","44444","","800002",""' . "\r\n"
        . '"2026","5","31","12","17","4","0000101","DUMMY_EXCLUDED_TRANSFER","","333333","700003",""' . "\r\n");
} finally {
    putenv('BUDGET_PAYMENT_IMPORT_EXCLUSIONS_PATH');
    unlink($bankExclusionsPath);
}

test_assert($bank['source_type'] === 'bank_csv', 'CP932 bank CSV source type is detected');
test_assert($bank['date_from'] === '2026-05-20', 'bank CSV date range starts from the first operation date');
test_assert($bank['date_to'] === '2026-05-31', 'bank CSV date range ends at the last operation date');
test_assert($bank['statement_payment_on'] === '2026-05-31', 'bank CSV import date is the last operation date');
test_assert(count($bank['rows']) === 3, 'bank CSV imports deposits and excludes configured payment merchants');
test_assert($bank['rows'][0]['fields']['transaction_type'] === 'income', 'bank CSV deposit is normalized as income');
test_assert($bank['rows'][0]['fields']['used_on'] === '2026-05-20', 'bank CSV income date is normalized');
test_assert($bank['rows'][0]['fields']['statement_payment_on'] === '2026-05-20', 'bank CSV income received date matches operation date');
test_assert($bank['rows'][0]['fields']['merchant'] === 'DUMMY_BANK_INCOME_SOURCE', 'bank CSV income description is preserved');
test_assert($bank['rows'][0]['fields']['payment_method'] === '銀行口座', 'bank CSV income receiving method is fixed');
test_assert($bank['rows'][0]['fields']['payment_category'] === '入金', 'bank CSV income payment category is fixed');
test_assert($bank['rows'][0]['fields']['usage_amount'] === 111111, 'bank CSV income usage amount is parsed');
test_assert($bank['rows'][0]['fields']['billing_amount'] === 111111, 'bank CSV income billing amount is parsed');
test_assert($bank['rows'][1]['fields']['transaction_type'] === 'expense', 'bank CSV payment is normalized as expense');
test_assert($bank['rows'][1]['fields']['used_on'] === '2026-05-27', 'bank CSV expense used date is normalized');
test_assert($bank['rows'][1]['fields']['statement_payment_on'] === '2026-05-27', 'bank CSV expense payment date matches used date');
test_assert($bank['rows'][1]['fields']['merchant'] === 'DUMMY_BANK_EXPENSE_MERCHANT', 'bank CSV expense merchant is trimmed');
test_assert($bank['rows'][1]['fields']['payment_method'] === '銀行口座', 'bank CSV expense payment method is fixed');
test_assert($bank['rows'][1]['fields']['payment_category'] === '1回', 'bank CSV expense payment category is fixed');
test_assert($bank['rows'][1]['fields']['usage_amount'] === 22222, 'bank CSV expense usage amount is parsed');
test_assert($bank['rows'][1]['fields']['billing_amount'] === 22222, 'bank CSV expense billing amount is parsed');
test_assert($bank['rows'][2]['fields']['transaction_type'] === 'income', 'bank CSV exclusion list does not drop income rows');
test_assert($bank['rows'][2]['fields']['merchant'] === 'DUMMY_EXCLUDED_TRANSFER', 'bank CSV income exclusion-name description is preserved');
test_assert($bank['rows'][2]['fields']['billing_amount'] === 333333, 'bank CSV exclusion-name income amount is parsed');

echo "OK\n";
