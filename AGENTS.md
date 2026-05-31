# Repository Instructions

- Reply to the user in Japanese by default.
- Treat `database/schema.sql` as the source of truth for the expected database structure.
- When the expected database structure changes, update `database/schema.sql` in the same change.
- When the expected database structure changes, add a concrete SQL migration file under `database/migrations/` in the same change.
- Name migration files with a sortable date prefix and a short purpose, such as `YYYYMMDD_add_example_column.sql`.
- Production database change reports should assume the SQL file will be copied with `scp` before execution.
- When the expected database structure changes, include the `scp` command and the production `mysql < migration.sql` command in the final user-facing report.
- Do not run production SSH or production database commands autonomously. Present the command, reason, expected effect, and risk for the user to run outside Codex.
- Keep production `scp`, SSH, and SQL execution commands concrete and executable, using placeholders only for environment-specific values such as host, SSH user, SSH port, server path, database user, database host, and database name.
