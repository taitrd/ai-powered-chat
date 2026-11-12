#!/usr/bin/env bash
set -euo pipefail

# Runs Alembic database migrations.
# Usage:
#   ./scripts/migrate.sh local                 # local docker or dev postgres
#   ./scripts/migrate.sh prod                  # production Aurora, through the RDS Data API

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_TARGET="${1:-local}"

# Load .env and .env.iac if present
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

if [ -f "$ROOT_DIR/.env.iac" ]; then
    set -a
    source "$ROOT_DIR/.env.iac"
    set +a
fi

# Locate alembic binary
ALEMBIC_BIN=""
if [ -f "$ROOT_DIR/.venv/bin/alembic" ]; then
    ALEMBIC_BIN="$ROOT_DIR/.venv/bin/alembic"
elif [ -f "$BACKEND_DIR/.venv/bin/alembic" ]; then
    ALEMBIC_BIN="$BACKEND_DIR/.venv/bin/alembic"
elif command -v alembic >/dev/null 2>&1; then
    ALEMBIC_BIN="alembic"
elif command -v python3 >/dev/null 2>&1 && python3 -m alembic --version >/dev/null 2>&1; then
    ALEMBIC_BIN="python3 -m alembic"
else
    echo "Error: alembic was not found in .venv or PATH."
    echo "Activate your virtualenv first: source .venv/bin/activate"
    exit 1
fi

echo "Running migrations for environment: ${ENV_TARGET}..."

if [ "$ENV_TARGET" = "local" ]; then
    export DB_AUTH_MODE="password"
    # When running locally on host machine, map docker service name 'db' to localhost
    if [[ "${DATABASE_URL:-}" == *"@db:"* ]]; then
        export DATABASE_URL="${DATABASE_URL//@db:/@localhost:}"
    fi
fi

if [ "$ENV_TARGET" = "prod" ]; then
    # Aurora is private: migrations run through the RDS Data API (HTTPS), signed in as the
    # admin user, which owns the tables. Needs AWS credentials allowed to use the Data API
    # and the admin secret (the ChatData "dataApiOperatorUser" policy). No password prompt.
    REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"
    PY_BIN="$ROOT_DIR/.venv/bin/python3"
    if [ ! -f "$PY_BIN" ]; then
        PY_BIN="python3"
    fi

    echo "Looking up the Aurora cluster and admin secret from the ChatData stack..."
    eval "$("$PY_BIN" - "$REGION" <<'PY'
import sys

import boto3

stack = boto3.client("cloudformation", region_name=sys.argv[1]).describe_stacks(StackName="ChatData")
outputs = {o["OutputKey"]: o["OutputValue"] for o in stack["Stacks"][0]["Outputs"]}
print(f'export DATA_API_RESOURCE_ARN="{outputs["ClusterArn"]}"')
print(f'export DATA_API_SECRET_ARN="{outputs["AdminSecretArn"]}"')
PY
)"
    export DB_DRIVER="dataapi" DATA_API_DATABASE="chat" AWS_REGION="$REGION"
    echo "Migrating through the RDS Data API as the admin user..."

fi

cd "$BACKEND_DIR"
$ALEMBIC_BIN upgrade head
echo "Migrations completed successfully."
