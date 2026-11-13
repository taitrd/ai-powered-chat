"""Seed a LOCAL PostgreSQL with many messages and print EXPLAIN ANALYZE for the hot queries.

Local only: refuses any host other than localhost. Never run this against Aurora, because
the storage costs money and the work keeps the database awake (PLAN.md, Section 6).

    python -m scripts.seed_messages --dsn postgresql://chat:chat@localhost:5432/chat_test \
        --messages 1000000
"""

import argparse
import asyncio
from urllib.parse import urlparse

import asyncpg

QUERIES = {
    "conversation list (cursor page)": (
        "SELECT * FROM conversations WHERE user_id = $1 "
        "ORDER BY updated_at DESC, id DESC LIMIT 21"
    ),
    "message page (newest 25)": (
        "SELECT * FROM messages WHERE conversation_id = $1 "
        "ORDER BY created_at DESC, id DESC LIMIT 26"
    ),
    "AI context (last 40)": (
        "SELECT * FROM messages WHERE conversation_id = $1 "
        "ORDER BY created_at DESC, id DESC LIMIT 40"
    ),
    "daily usage (user + global)": (
        "SELECT sum(messages) FROM daily_usage WHERE day = current_date"
    ),
}


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", required=True)
    parser.add_argument("--messages", type=int, default=1_000_000)
    parser.add_argument("--users", type=int, default=1000)
    parser.add_argument("--per-chat", type=int, default=100)
    args = parser.parse_args()

    if urlparse(args.dsn).hostname not in {"localhost", "127.0.0.1", "db"}:
        raise SystemExit("Refusing to seed a non-local database.")

    conn = await asyncpg.connect(args.dsn)
    chats = args.messages // args.per_chat
    await conn.execute("TRUNCATE users, conversations, messages, daily_usage CASCADE")
    await conn.execute(
        # The first three users are the frontend's local dev users (AUTH_MODE=local),
        # so you can sign in as them and browse seeded chats.
        "INSERT INTO users (cognito_sub) SELECT CASE g WHEN 1 THEN 'local|dev' "
        "WHEN 2 THEN 'local|alice' WHEN 3 THEN 'local|bob' ELSE 'seed-' || g END "
        "FROM generate_series(1, $1) g",
        args.users,
    )
    await conn.execute(
        """
        INSERT INTO conversations (user_id, title, message_count, updated_at)
        SELECT u.id, 'Seed ' || g, $2, now() - (g || ' seconds')::interval
        FROM generate_series(1, $1) g
        JOIN (SELECT id, row_number() OVER () AS rn FROM users) u ON u.rn = (g % $3) + 1
        """,
        chats,
        args.per_chat,
        args.users,
    )
    await conn.execute(
        """
        INSERT INTO messages (conversation_id, role, content, created_at)
        SELECT c.id, CASE WHEN m % 2 = 1 THEN 'user' ELSE 'assistant' END,
               repeat('x', 200), now() - interval '30 days' + (m || ' seconds')::interval
        FROM conversations c, generate_series(1, $1) m
        """,
        args.per_chat,
    )
    await conn.execute(
        "INSERT INTO daily_usage (day, user_id, messages) "
        "SELECT current_date, id, 0 FROM users"  # 0 so seeding never trips the daily limits
    )
    await conn.execute("ANALYZE")

    user_id = await conn.fetchval("SELECT id FROM users LIMIT 1")
    conv_id = await conn.fetchval(
        "SELECT id FROM conversations WHERE user_id = $1 LIMIT 1", user_id
    )
    params = {"conversation": (user_id,), "message": (conv_id,), "AI": (conv_id,)}
    for name, sql in QUERIES.items():
        key = next((k for k in params if k in name), None)
        print(f"\n== {name}")
        plan = await conn.fetch("EXPLAIN (ANALYZE, COSTS OFF) " + sql, *(params.get(key, ())))
        print("\n".join(r[0] for r in plan))
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
