# Budget

PHP + MySQL household budget app for `https://example.com/budget`.

The app exposes read-only transaction views publicly. Admin-only changes, including CSV import, transaction delete/restore, import deletion, and label editing, require the single admin password configured outside the web root.

## Repository Layout

```text
database/schema.sql      MySQL/MariaDB schema
public/                  Files mirrored to Xserver public_html/budget
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
- `GET /api/summary.php?group_by=day|week|month`
- `GET /api/labels.php`

Admin API:

- `GET /api/session.php`
- `POST /api/session.php`
- `DELETE /api/session.php`
- `POST /api/imports.php`
- `GET /api/imports.php`
- `DELETE /api/imports.php?id=...`
- `DELETE /api/transactions.php?id=...`
- `POST /api/transactions.php?action=restore&id=...`
- `POST /api/labels.php`
- `PUT /api/labels.php?id=...`
- `DELETE /api/labels.php?id=...`
- `POST /api/labels.php?action=assign`
- `DELETE /api/labels.php?action=unassign&transaction_id=...&label_id=...`

All API responses are JSON with `Cache-Control: no-store`. Mutating admin requests require both an authenticated PHP session and the `X-CSRF-Token` header.

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

1. Open `https://example.com/budget`.
2. Click `管理ログイン`.
3. Upload the card-detail CSV from the `CSV取込` panel.

The importer validates CSV headers and values, not file extensions. Each CSV must contain exactly one `当月お支払日`.

Re-uploading the same payment-month CSV is safe:

- Rows already present with the same content are kept.
- Rows with the same identity but changed content are updated.
- Rows newly present in the CSV are inserted.
- Rows missing from the latest same-month CSV are marked with `superseded_at`.
- User-deleted rows use `deleted_at` and are not restored by re-upload.

The budget default amount/date is:

- `支払区分 = 1回`: `利用日/キャンセル日` and `利用金額`
- `支払区分 = 均等 ...`: `当月お支払日` and `当月支払金額`
- Other non-`1回` categories use the same payment-date basis.

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
- SQL structure values such as `group_by`, `amount_basis`, sort fields, IDs, and paging are allowlisted or integer-clamped.
- Merchant search uses escaped `LIKE` partial matching only.
- Frontend rendering uses `textContent` for user-controlled strings.
- `robots.txt` and `<meta name="robots" content="noindex, nofollow">` reduce search exposure but are not access control.

## Rollback

Because deployment mirrors `public/` with `--delete`, rollback by reverting the bad commit and pushing `main` again:

```sh
git revert <bad-commit>
git push origin main
```

For a manual rollback, re-run a successful workflow from an older commit if that commit is still available in GitHub Actions.
