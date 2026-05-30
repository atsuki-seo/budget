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
    . '"2026/3/2","DUMMY_CARD_MERCHANT_B","本人","PayPayカード ゴールド","均等 2／6","222222","0","222222","22222","33333","0","2026/4/27"' . "\n");

test_assert($parsed['statement_payment_on'] === '2026-04-27', 'statement payment date is normalized');
test_assert(count($parsed['rows']) === 2, 'BOM UTF-8 CSV rows are parsed');
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

echo "OK\n";
