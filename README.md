# Budget

PHP + MySQL household budget app for `https://example.com/budget`.

The app exposes read-only transaction views publicly. Admin-only changes, including CSV import and import deletion, require the single admin password configured outside the web root.

## Repository Layout

```text
database/schema.sql      Current MySQL/MariaDB schema
public/                  Files mirrored to Xserver public_html/budget
public/admin/            Admin screen for CSV import
public/api/              JSON API endpoints
public/assets/           Vanilla CSS/JavaScript
public/lib/app.php       Shared PHP runtime helpers
tests/                   Local parser smoke tests
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
Dates filter `statement_payment_on`, `limit` defaults to `100`, and rows are ordered by `used_on DESC, id DESC`.

`GET /api/summary.php` supports `date_from` and `date_to`, groups by payment month from `statement_payment_on`, and sums `billing_amount`.
The public `/budget/` UI exposes only start/end payment-month selectors for months with data.

Admin API:

- `GET /api/session.php`
- `POST /api/session.php`
- `DELETE /api/session.php`
- `POST /api/imports.php`
- `GET /api/imports.php`
- `DELETE /api/imports.php?id=...`

All API responses are JSON with `Cache-Control: no-store`. Mutating admin requests require both an authenticated PHP session and the `X-CSRF-Token` header.

`GET /api/imports.php` defaults to `limit=5`, supports `offset`, and returns import log rows in reverse import order.
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

## CSV Import

1. Open `https://example.com/budget/admin/`.
2. Enter the admin password in the login dialog.
3. Upload the card-detail CSV from the `CSV取込` screen.

The importer validates CSV headers and values, not file extensions. Each CSV must contain exactly one `当月お支払日`.

Re-uploading the same payment-month CSV performs a month replacement:

- Existing `transactions` rows with the same `statement_payment_on` are physically deleted first.
- All rows from the uploaded CSV are inserted and attached to the new `imports.id`.
- Other payment dates are not changed.
- Future provisional manual rows use `import_id = NULL` and are also replaced when a CSV with the same payment date arrives.

The CSV file is treated as the source of truth. Per-row diff tracking, transaction soft delete/restore, budget date/amount derivation, and labels are not part of the current schema or API.

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
