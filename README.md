# Budget

PHP + MySQL household budget app for `https://example.com/budget`.

The app exposes read-only transaction views publicly. Admin-only changes, including manual transaction entry, CSV import, and import deletion, require the single admin password configured outside the web root.

## Repository Layout

```text
database/schema.sql      Current MySQL/MariaDB schema
public/                  Files mirrored to Xserver public_html/budget
public/admin/            Admin screen for manual transaction entry and CSV import
public/api/              JSON API endpoints
public/assets/           Vanilla CSS/JavaScript
public/lib/app.php       Shared PHP runtime helpers
tests/                   Local parser and normalization smoke tests
```

The GitHub Actions workflow mirrors only `public/` to:

```text
YOUR_DOMAIN/public_html/budget/
```

Secrets and local CSV exports are not committed. The production config file lives outside `public_html`:

```text
~/YOUR_DOMAIN/budget-config.php
```

## API

Public read API:

- `GET /api/transactions.php`
- `GET /api/summary.php`

`GET /api/transactions.php` supports `date_from`, `date_to`, `limit`, and `offset`.
Dates filter the selected transaction month: expense rows use `statement_payment_on`, and income rows store the received date in `statement_payment_on`.
Rows include `transaction_type`, which is either `expense` or `income`.
When `limit` or `offset` is present, paging is applied with the previous `limit=100` default and `limit=200` maximum. When both are omitted, all rows in the selected period are returned.
Rows are ordered with income before expense, then by `statement_payment_on DESC`, with `1回` before other payment categories within the same payment date, then by `payment_method` with `銀行口座` first, and `id DESC` as the final tie-breaker.

`GET /api/summary.php` supports `date_from` and `date_to`, groups by month from `statement_payment_on`, and returns `income_amount` and `expense_amount`.
The public `/budget/` UI exposes only start/end month selectors for months with data.

Admin API:

- `GET /api/session.php`
- `POST /api/session.php`
- `DELETE /api/session.php`
- `POST /api/transactions.php`
- `GET /api/manual_transactions.php`
- `POST /api/imports.php`
- `GET /api/imports.php`
- `DELETE /api/imports.php?id=...`

All API responses are JSON with `Cache-Control: no-store`. Mutating admin requests require both an authenticated PHP session and the `X-CSRF-Token` header.

`GET /api/manual_transactions.php` defaults to `transaction_type=expense`, `limit=5`, supports `transaction_type=expense|income` and `offset`, and returns hand-entered transactions in reverse creation order.

`GET /api/imports.php` defaults to `limit=5`, supports `offset` and optional comma-separated `source_types`, and returns import log rows in reverse import order.
Each import row includes `source_type`, where `csv` is an uploaded PayPay card CSV, `bank_csv` is an uploaded bank-account CSV, and `manual` is a single hand-entered transaction.
When `source_types` is omitted, all import rows are returned. The admin UI uses `source_types=csv,bank_csv` so hand-entered rows appear only in the `決済情報の追加` list.
`DELETE /api/imports.php?id=...` physically deletes the import row. Transactions still attached to that import are deleted by the foreign key cascade.

## Initial Xserver Setup

Create the admin password hash on Xserver:

```sh
cd ~/YOUR_DOMAIN

read -rsp 'Budget admin password: ' BUDGET_ADMIN_PASSWORD
echo
php -r '$p=trim(stream_get_contents(STDIN)); echo password_hash($p, PASSWORD_DEFAULT), PHP_EOL;' <<< "$BUDGET_ADMIN_PASSWORD"
unset BUDGET_ADMIN_PASSWORD
```

Create the config file outside the public web directory:

```sh
umask 077
cat > ~/YOUR_DOMAIN/budget-config.php <<'PHP'
<?php

return [
    'db' => [
        'host' => 'YOUR_DB_HOST',
        'name' => 'YOUR_DB_NAME',
        'user' => 'YOUR_DB_USER',
        'password' => 'YOUR_DB_PASSWORD',
        'charset' => 'utf8mb4',
    ],
    'admin_password_hash' => 'PASTE_PASSWORD_HASH_HERE',
    'session_name' => 'budget_admin',
    'cookie_secure' => true,
    'max_upload_bytes' => 2097152,
];
PHP
```

Create the database tables:

```sh
mysql -h YOUR_DB_HOST -u YOUR_DB_USER -p YOUR_DB_NAME < database/schema.sql
```

For local HTTP-only development, set `'cookie_secure' => false` in a local ignored `budget-config.php`.

Existing deployments created before manual entry support must add `imports.source_type` before deploying this code.
Copy the migration file to the server, then run it against the production database:

```sh
scp -P YOUR_XSERVER_PORT database/migrations/20260531_add_imports_source_type.sql \
  YOUR_XSERVER_USER@YOUR_XSERVER_HOST:~/YOUR_DOMAIN/20260531_add_imports_source_type.sql

ssh -p YOUR_XSERVER_PORT YOUR_XSERVER_USER@YOUR_XSERVER_HOST \
  'mysql -h YOUR_DB_HOST -u YOUR_DB_USER -p YOUR_DB_NAME < ~/YOUR_DOMAIN/20260531_add_imports_source_type.sql'
```

Existing deployments created before income support must add `transactions.transaction_type`.
Copy the migration file to the server, then run it against the production database:

```sh
scp -P YOUR_XSERVER_PORT database/migrations/20260531_add_transaction_type.sql \
  YOUR_XSERVER_USER@YOUR_XSERVER_HOST:~/YOUR_DOMAIN/20260531_add_transaction_type.sql

ssh -p YOUR_XSERVER_PORT YOUR_XSERVER_USER@YOUR_XSERVER_HOST \
  'mysql -h YOUR_DB_HOST -u YOUR_DB_USER -p YOUR_DB_NAME < ~/YOUR_DOMAIN/20260531_add_transaction_type.sql'
```

## Manual Transaction Entry

1. Open `https://example.com/budget/admin/`.
2. Enter the admin password in the login dialog.
3. Use `決済情報の追加` -> `追加` to enter one income or expense transaction at a time.

Manual entry creates one `imports` row with `source_type='manual'`, `source_filename='手入力'`, and `row_count=1`.
The admin screen lists hand-entered expense and income rows separately under `決済情報の追加`.

Expense entry stores `transaction_type='expense'`. If `transaction_type` is omitted in the API request, the request is treated as an expense for backward compatibility.
Supported expense payment methods are fixed to the known PayPay card values plus `銀行口座` and `現金`.
For `銀行口座` and `現金`, `statement_payment_on` is forced to `used_on` and `payment_category` is forced to `1回`.
For card payment methods, the form accepts `1回` or `均等 N／M`; `M` must be one of `2,3,5,6,10,12,15,18,20,24,30,36,48` and `N` must be within `1..M`.

Income entry stores `transaction_type='income'`. The API accepts `received_on`, `description`, `receiving_method`, and `amount`.
Supported receiving methods are `現金` and `銀行口座`.
Income stores `received_on` in both `statement_payment_on` and `used_on`, stores `description` in `merchant`, stores `receiving_method` in `payment_method`, and uses `payment_category='入金'`.

## CSV Import

1. Open `https://example.com/budget/admin/`.
2. Enter the admin password in the login dialog.
3. Upload the payment CSV from the `決済情報の取り込み` screen.

The importer validates CSV headers and values, not file extensions.

Supported CSV formats:

- PayPay card detail CSV in UTF-8. Each file must contain exactly one `当月お支払日`.
- Bank-account CSV in CP932/SJIS with the bank export headers. Positive `お支払金額` rows are imported as `expense`; positive `お預り金額` rows are imported as `income`. `操作日` becomes both `used_on` and `statement_payment_on`, `摘要` becomes `merchant`, and the amount column becomes both `usage_amount` and `billing_amount`.

Bank-account merchant exclusions are configured in `public/lib/payment_import_exclusions.php` under `bank_merchant_exact`. Matching is exact after trimming leading and trailing ASCII/full-width whitespace. Exclusions apply only to `お支払金額` expense rows; `お預り金額` income rows are not excluded by this list.

Re-uploading the same PayPay payment-month CSV performs a month replacement:

- Existing CSV imports with the same `statement_payment_on` are physically deleted first.
- Existing card-payment manual imports with the same `statement_payment_on` are physically deleted first.
- Manual `現金` and `銀行口座` imports are kept even when their `statement_payment_on` matches the uploaded CSV.
- All rows from the uploaded CSV are inserted and attached to the new `imports.id`.
- Other payment dates are not changed.

Re-uploading a bank-account CSV replaces the operation-date range covered by that CSV:

- Existing `bank_csv` transactions in the range are physically deleted first.
- Existing manual `銀行口座` imports in the range are physically deleted first, for both income and expense rows.
- Positive `お支払金額` rows excluded by `bank_merchant_exact` are not inserted.
- Positive `お預り金額` rows are inserted as income.

The CSV file is treated as the source of truth for imported payment rows. Per-row diff tracking, transaction soft delete/restore, budget date/amount derivation, and labels are not part of the current schema or API.

## Deployment

Deployments run on:

- Pushes to `main`.
- Manual `workflow_dispatch` runs.

The workflow:

- Checks out the repository with `actions/checkout@v6`.
- Installs the Actions-only SSH key and pinned known-hosts entry.
- Verifies SSH access, target directory creation, and remote `rsync`.
- Runs `rsync -az --delete` from `public/` to the Xserver target directory.
- Verifies `PUBLIC_URL` and `PUBLIC_URL/health.php`.

Because deployment mirrors only `public/`, the external `~/YOUR_DOMAIN/budget-config.php` file is not deleted by `rsync --delete`.

## GitHub Environment

Create the GitHub environment `xserver-production`, restrict it to the `main` branch, and set these environment variables:

```sh
gh api --method PUT repos/YOUR_GITHUB_OWNER/budget/environments/xserver-production \
  -F wait_timer=0 \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'

gh api --method POST repos/YOUR_GITHUB_OWNER/budget/environments/xserver-production/deployment-branch-policies \
  -f name=main
```

| Name | Value |
| --- | --- |
| `XSERVER_HOST` | `YOUR_XSERVER_HOST` |
| `XSERVER_PORT` | `YOUR_XSERVER_PORT` |
| `XSERVER_USER` | `YOUR_XSERVER_USER` |
| `XSERVER_TARGET_DIR` | `YOUR_DOMAIN/public_html/budget` |
| `PUBLIC_URL` | `https://example.com/budget` |

CLI equivalent:

```sh
gh variable set XSERVER_HOST --env xserver-production --body "YOUR_XSERVER_HOST"
gh variable set XSERVER_PORT --env xserver-production --body "YOUR_XSERVER_PORT"
gh variable set XSERVER_USER --env xserver-production --body "YOUR_XSERVER_USER"
gh variable set XSERVER_TARGET_DIR --env xserver-production --body "YOUR_DOMAIN/public_html/budget"
gh variable set PUBLIC_URL --env xserver-production --body "https://example.com/budget"
```

## Xserver SSH Key

Use a dedicated Actions-only SSH key. Do not reuse a personal machine key.

```sh
mkdir -p .ssh
ssh-keygen -t ed25519 -f .ssh/xserver_actions_ed25519 -C "github-actions-budget-xserver" -N ""
```

Register only the public key in Xserver SSH settings:

```sh
cat .ssh/xserver_actions_ed25519.pub
```

Store the private key as the GitHub environment secret `XSERVER_SSH_KEY`.

```sh
gh secret set XSERVER_SSH_KEY --env xserver-production < .ssh/xserver_actions_ed25519
```

## Host Key

Capture the Xserver SSH host key locally, then verify the fingerprint through a trusted channel before storing it in GitHub.

```sh
ssh-keyscan -p YOUR_XSERVER_PORT YOUR_XSERVER_HOST > .ssh/xserver_known_hosts
ssh-keygen -lf .ssh/xserver_known_hosts
```

Store the verified known-hosts file as the GitHub environment secret `XSERVER_KNOWN_HOSTS`.

```sh
gh secret set XSERVER_KNOWN_HOSTS --env xserver-production < .ssh/xserver_known_hosts
```

Before the first GitHub Actions connection test, turn Xserver's foreign IP access restriction OFF for SSH.

The public host must have a matching SSL certificate. Keep `PUBLIC_URL` on HTTPS unless the certificate configuration changes.

## Verification

Local syntax and parser checks:

```sh
node --check public/assets/app.js
find public tests -name '*.php' -print0 | xargs -0 -n1 php -l
php tests/csv_parser_test.php
php tests/manual_transaction_test.php
```

After deployment:

```sh
curl -fsSL https://example.com/budget/
curl -fsSL https://example.com/budget/health.php
```

The PHP health check should return:

```text
OK
```

## Security Notes

- PDO uses native prepared statements, exception mode, and `charset=utf8mb4`.
- SQL structure values are fixed in code; IDs and paging are integer-clamped.
- Frontend rendering uses `textContent` for user-controlled strings.
- `robots.txt` and `<meta name="robots" content="noindex, nofollow">` reduce search exposure but are not access control.

## Rollback

Because deployment mirrors `public/` with `--delete`, rollback by reverting the bad commit and pushing `main` again:

```sh
git revert <bad-commit>
git push origin main
```

For a manual rollback, re-run a successful workflow from an older commit if that commit is still available in GitHub Actions.
