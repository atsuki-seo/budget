# Repository Instructions

- Reply to the user in Japanese by default.
- Treat `database/scheme.sql` as the source of truth for the expected database structure.
- When the expected database structure changes, update `database/scheme.sql` in the same change.
- When the expected database structure changes, include the SQL command or commands that must be run in production over SSH in the final user-facing report.
- Do not run production SSH or production database commands autonomously. Present the command, reason, expected effect, and risk for the user to run outside Codex.
- Keep production SQL commands concrete and executable, using placeholders only for environment-specific values such as host, user, and database name.
