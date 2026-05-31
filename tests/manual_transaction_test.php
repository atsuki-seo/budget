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

function test_expect_invalid_manual(array $data, string $message): void
{
    try {
        budget_normalize_manual_transaction($data);
    } catch (InvalidArgumentException $exception) {
        return;
    }

    fwrite(STDERR, "FAIL: $message\n");
    exit(1);
}

function test_expect_invalid_update(callable $normalize, array $data, string $message): void
{
    try {
        $normalize($data);
    } catch (InvalidArgumentException $exception) {
        return;
    }

    fwrite(STDERR, "FAIL: $message\n");
    exit(1);
}

$card = budget_normalize_manual_transaction([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'card_user' => '家族',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '均等 2／6',
    'amount' => '222,222',
]);

test_assert($card['used_on'] === '2026-03-01', 'card used date is preserved');
test_assert($card['transaction_type'] === 'expense', 'manual card defaults to expense');
test_assert($card['statement_payment_on'] === '2026-04-27', 'card payment date is preserved');
test_assert($card['merchant'] === 'DUMMY_CARD_MERCHANT', 'merchant is preserved');
test_assert($card['card_user'] === '家族', 'card user is preserved');
test_assert($card['payment_method'] === 'PayPayカード ゴールド', 'card payment method is preserved');
test_assert($card['payment_category'] === '均等 2／6', 'installment category is preserved');
test_assert($card['usage_amount'] === 222222, 'usage amount is normalized');
test_assert($card['billing_amount'] === 222222, 'billing amount matches usage amount');
test_assert($card['carried_forward_amount'] === 0, 'carried forward amount is fixed');
test_assert($card['adjustment_amount'] === 0, 'adjustment amount is fixed');

$cash = budget_normalize_manual_transaction([
    'transaction_type' => 'expense',
    'used_on' => '2026-03-02',
    'merchant' => 'DUMMY_CASH_EXPENSE_MERCHANT',
    'payment_method' => '現金',
    'payment_category' => '均等 1／2',
    'statement_payment_on' => '2026-04-27',
    'amount' => '111111',
]);

test_assert($cash['statement_payment_on'] === '2026-03-02', 'cash payment date is forced to used date');
test_assert($cash['transaction_type'] === 'expense', 'manual cash expense type is preserved');
test_assert($cash['card_user'] === '本人', 'manual expense card user defaults to self');
test_assert($cash['payment_category'] === '1回', 'cash payment category is forced to one time');

$bank = budget_normalize_manual_transaction([
    'used_on' => '2026-03-03',
    'merchant' => 'DUMMY_BANK_EXPENSE_MERCHANT',
    'payment_method' => '銀行口座',
    'amount' => '22222',
]);

test_assert($bank['statement_payment_on'] === '2026-03-03', 'bank payment date is forced to used date');
test_assert($bank['payment_category'] === '1回', 'bank payment category is forced to one time');

$cashIncome = budget_normalize_manual_transaction([
    'transaction_type' => 'income',
    'received_on' => '2026-03-04',
    'description' => 'DUMMY_CASH_INCOME_SOURCE',
    'card_user' => '家族',
    'receiving_method' => '現金',
    'amount' => '333333',
]);

test_assert($cashIncome['transaction_type'] === 'income', 'manual cash income type is preserved');
test_assert($cashIncome['statement_payment_on'] === '2026-03-04', 'cash income received date is stored as statement payment date');
test_assert($cashIncome['used_on'] === '2026-03-04', 'cash income received date is stored as used date');
test_assert($cashIncome['merchant'] === 'DUMMY_CASH_INCOME_SOURCE', 'cash income description is stored as merchant');
test_assert($cashIncome['card_user'] === '家族', 'manual income card user is preserved');
test_assert($cashIncome['payment_method'] === '現金', 'cash income receiving method is stored as payment method');
test_assert($cashIncome['payment_category'] === '入金', 'cash income payment category is fixed');
test_assert($cashIncome['usage_amount'] === 333333, 'cash income usage amount is normalized');
test_assert($cashIncome['billing_amount'] === 333333, 'cash income billing amount is normalized');

$bankIncome = budget_normalize_manual_transaction([
    'transaction_type' => 'income',
    'received_on' => '2026-03-05',
    'description' => 'DUMMY_BANK_INCOME_SOURCE',
    'receiving_method' => '銀行口座',
    'amount' => '444444',
]);

test_assert($bankIncome['transaction_type'] === 'income', 'manual bank income type is preserved');
test_assert($bankIncome['payment_method'] === '銀行口座', 'manual bank income receiving method is accepted');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'card_user' => 'Other',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '1回',
    'amount' => '111111',
], 'invalid card user is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'payment_method' => 'Other',
    'payment_category' => '1回',
    'amount' => '111111',
], 'invalid payment method is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-02-30',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '1回',
    'amount' => '111111',
], 'invalid used date is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-31',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '1回',
    'amount' => '111111',
], 'invalid card payment date is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '均等 7／6',
    'amount' => '111111',
], 'installment number greater than count is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '均等 1／4',
    'amount' => '111111',
], 'unsupported installment count is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '1回',
    'amount' => '0',
], 'zero amount is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => 'DUMMY_CARD_MERCHANT',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '1回',
    'amount' => '-111111',
], 'negative amount is rejected');

test_expect_invalid_manual([
    'used_on' => '2026-03-01',
    'statement_payment_on' => '2026-04-27',
    'merchant' => '',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '1回',
    'amount' => '111111',
], 'empty merchant is rejected');

test_expect_invalid_manual([
    'transaction_type' => 'income',
    'received_on' => '2026-03-01',
    'description' => 'DUMMY_INCOME_SOURCE',
    'receiving_method' => 'PayPayカード ゴールド',
    'amount' => '111111',
], 'invalid receiving method is rejected');

test_expect_invalid_manual([
    'transaction_type' => 'income',
    'received_on' => '2026-02-30',
    'description' => 'DUMMY_INCOME_SOURCE',
    'receiving_method' => '現金',
    'amount' => '111111',
], 'invalid received date is rejected');

test_expect_invalid_manual([
    'transaction_type' => 'income',
    'received_on' => '2026-03-01',
    'description' => 'DUMMY_INCOME_SOURCE',
    'receiving_method' => '現金',
    'amount' => '0',
], 'zero income amount is rejected');

test_expect_invalid_manual([
    'transaction_type' => 'income',
    'received_on' => '2026-03-01',
    'description' => '',
    'receiving_method' => '現金',
    'amount' => '111111',
], 'empty income description is rejected');

$expenseUpdate = budget_normalize_expense_transaction_update([
    'statement_payment_on' => '2026-06-30',
    'used_on' => '2026-05-31',
    'merchant' => 'DUMMY_UPDATED_EXPENSE',
    'card_user' => '家族*',
    'payment_method' => 'PayPayカード ゴールド',
    'payment_category' => '均等 1／2',
    'billing_amount' => '-1,234',
    'usage_amount' => '0000',
    'carried_forward_amount' => '1234',
    'adjustment_amount' => '-5',
]);

test_assert($expenseUpdate['statement_payment_on'] === '2026-06-30', 'expense update payment date is preserved');
test_assert($expenseUpdate['used_on'] === '2026-05-31', 'expense update used date is preserved');
test_assert($expenseUpdate['card_user'] === '家族', 'expense update trims card user marker');
test_assert($expenseUpdate['billing_amount'] === -1234, 'expense update accepts negative billing amount');
test_assert($expenseUpdate['usage_amount'] === 0, 'expense update accepts zero usage amount');
test_assert($expenseUpdate['adjustment_amount'] === -5, 'expense update accepts negative adjustment amount');

$incomeUpdate = budget_normalize_income_transaction_update([
    'statement_payment_on' => '2026-06-01',
    'merchant' => 'DUMMY_UPDATED_INCOME',
    'card_user' => '本人*',
    'payment_method' => '銀行口座',
    'billing_amount' => '555555',
]);

test_assert($incomeUpdate['statement_payment_on'] === '2026-06-01', 'income update received date is preserved');
test_assert($incomeUpdate['used_on'] === '2026-06-01', 'income update stores received date as used date');
test_assert($incomeUpdate['merchant'] === 'DUMMY_UPDATED_INCOME', 'income update description is preserved');
test_assert($incomeUpdate['card_user'] === '本人', 'income update trims card user marker');
test_assert($incomeUpdate['usage_amount'] === 555555, 'income update usage amount is normalized');

test_expect_invalid_update(
    'budget_normalize_expense_transaction_update',
    [
        'statement_payment_on' => '2026-06-30',
        'used_on' => '2026-05-31',
        'merchant' => 'DUMMY_UPDATED_EXPENSE',
        'card_user' => 'Other',
        'payment_method' => 'PayPayカード ゴールド',
        'payment_category' => '1回',
        'billing_amount' => '100',
        'usage_amount' => '100',
        'carried_forward_amount' => '0',
        'adjustment_amount' => '0',
    ],
    'invalid update card user is rejected'
);

echo "OK\n";
