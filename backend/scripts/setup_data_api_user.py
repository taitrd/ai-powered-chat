"""Create (or update) the `app_data` database user that the app uses through the RDS Data API.

Runs SQL through the Data API itself, signed in with the admin (postgres) secret, so it
needs no network path to the database. Safe to run more than once.

Usage (AWS credentials in the environment):
    python scripts/setup_data_api_user.py --cluster-arn ARN --admin-secret-arn ARN \
        --user-secret-arn ARN [--database chat] [--scratch-database chat_poc]

--scratch-database also creates an empty database owned by app_data, for live tests.
The user's password is read from --user-secret-arn and never printed.
"""

import argparse
import asyncio
import json
import time

import boto3

from app.db.dataapi.client import BotoDataApiClient, DataApiError

RESUME_TIMEOUT_SECONDS = 90


def quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


async def run(client: BotoDataApiClient, sql: str) -> dict:
    """Runs one statement outside a transaction, waiting while Aurora resumes from pause."""
    started = time.monotonic()
    while True:
        try:
            return await client.execute_statement(sql, [], None)
        except DataApiError as exc:
            waking = exc.code == "DatabaseResumingException" or "resuming" in str(exc).lower()
            if not waking or time.monotonic() - started > RESUME_TIMEOUT_SECONDS:
                raise
            await asyncio.sleep(3)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cluster-arn", required=True)
    parser.add_argument("--admin-secret-arn", required=True)
    parser.add_argument("--user-secret-arn", required=True)
    parser.add_argument("--database", default="chat")
    parser.add_argument("--scratch-database", default="")
    parser.add_argument("--region", default="us-east-1")
    args = parser.parse_args()

    secret = boto3.client("secretsmanager", region_name=args.region).get_secret_value(
        SecretId=args.user_secret_arn
    )
    user = json.loads(secret["SecretString"])
    username, password = user["username"], user["password"]

    def admin(database: str) -> BotoDataApiClient:
        return BotoDataApiClient(args.cluster_arn, args.admin_secret_arn, database, args.region)

    app_db = admin(args.database)
    started = time.monotonic()
    await run(app_db, "SELECT 1")
    print(f"Connected through the Data API in {time.monotonic() - started:.1f}s (includes resume)")

    exists = await run(app_db, f"SELECT 1 FROM pg_roles WHERE rolname = {quote_literal(username)}")
    verb = "ALTER ROLE" if exists.get("records") else "CREATE ROLE"
    await run(app_db, f'{verb} "{username}" WITH LOGIN PASSWORD {quote_literal(password)}')
    print(f"{'Updated' if verb == 'ALTER ROLE' else 'Created'} role {username}")

    # Same privileges as the IAM user `app` (see init-user.sql).
    for statement in (
        f'GRANT ALL PRIVILEGES ON DATABASE "{args.database}" TO "{username}"',
        f'GRANT ALL ON SCHEMA public TO "{username}"',
        f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{username}"',
        f'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "{username}"',
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "{username}"',
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "{username}"',
    ):
        await run(app_db, statement)
    print(f"Granted {username} access to database {args.database}")

    if args.scratch_database:
        name = args.scratch_database
        found = await run(
            app_db, f"SELECT 1 FROM pg_database WHERE datname = {quote_literal(name)}"
        )
        if not found.get("records"):
            # PostgreSQL 16+: giving a database to another role requires being able to
            # SET ROLE to it. Aurora's admin isn't a true superuser, so grant that first.
            await run(app_db, f'GRANT "{username}" TO CURRENT_USER WITH SET TRUE, INHERIT FALSE')
            await run(app_db, f'CREATE DATABASE "{name}" OWNER "{username}"')
            print(f"Created scratch database {name} owned by {username}")
        else:
            print(f"Scratch database {name} already exists")


if __name__ == "__main__":
    asyncio.run(main())
