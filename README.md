# Budget

Static/PHP smoke-check deployment for `http://example.com/budget`.

The GitHub Actions workflow mirrors only `public/` to the Xserver target directory:

```text
YOUR_XSERVER_HOST/public_html/budget/
```

## Repository

Create a public GitHub repository named `budget` from this directory.

```sh
git add README.md .gitignore .github/workflows/deploy.yml public/
git commit -m "chore: add xserver deployment workflow"
gh repo create budget --public --source . --remote origin
```

This creates the public repository and adds the `origin` remote. Push only after the GitHub environment, variables, and secrets are configured.

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
ssh-keyscan -p 10022 YOUR_XSERVER_HOST > .ssh/xserver_known_hosts
ssh-keygen -lf .ssh/xserver_known_hosts
```

Store the verified known-hosts file as the GitHub environment secret `XSERVER_KNOWN_HOSTS`.

```sh
gh secret set XSERVER_KNOWN_HOSTS --env xserver-production < .ssh/xserver_known_hosts
```

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
| `XSERVER_PORT` | `10022` |
| `XSERVER_USER` | `YOUR_XSERVER_USER` |
| `XSERVER_TARGET_DIR` | `YOUR_XSERVER_HOST/public_html/budget` |
| `PUBLIC_URL` | `http://example.com/budget` |

CLI equivalent:

```sh
gh variable set XSERVER_HOST --env xserver-production --body "YOUR_XSERVER_HOST"
gh variable set XSERVER_PORT --env xserver-production --body "10022"
gh variable set XSERVER_USER --env xserver-production --body "YOUR_XSERVER_USER"
gh variable set XSERVER_TARGET_DIR --env xserver-production --body "YOUR_XSERVER_HOST/public_html/budget"
gh variable set PUBLIC_URL --env xserver-production --body "http://example.com/budget"
```

Before the first GitHub Actions connection test, turn Xserver's foreign IP access restriction OFF for SSH.

The Xserver initial domain currently serves this deployment over HTTP. Use an HTTPS `PUBLIC_URL` only after the host has a matching SSL certificate.

## Initial Push

After the environment variables and secrets are in place, push `main` to start the first deployment:

```sh
git push -u origin main
```

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

## Verification

After deployment, check:

```sh
curl -fsSL http://example.com/budget/
curl -fsSL http://example.com/budget/health.php
```

The PHP health check should return:

```text
OK
```

## Rollback

Because deployment mirrors `public/` with `--delete`, rollback by reverting the bad commit and pushing `main` again:

```sh
git revert <bad-commit>
git push origin main
```

For a manual rollback, re-run a successful workflow from an older commit if that commit is still available in GitHub Actions.

## Failure Notes

- If SSH times out, check Xserver's foreign IP access restriction first.
- If host key verification fails, refresh `XSERVER_KNOWN_HOSTS` with `ssh-keyscan`, verify the fingerprint, then update the secret.
- If Xserver does not provide `rsync`, replace the workflow upload step with SFTP/SCP. That fallback will need a different deletion strategy because SCP does not mirror directories safely by itself.
