# Postgres replaces SQLite

The status store and the claims ledger move from SQLite (`better-sqlite3`) to PostgreSQL 16 with
Drizzle ORM. SQLite is removed, not kept as a fallback. The SQLite data had no value, so the
Postgres schema starts empty and no migration is written. Redis is a scale-phase item.
