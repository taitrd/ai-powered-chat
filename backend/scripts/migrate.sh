#!/usr/bin/env bash
set -euo pipefail

# Runs Alembic database migrations.
# Usage:
#   ./scripts/migrate.sh local                 # local docker or dev postgres
#   ./scripts/migrate.sh prod [POSTGRES_PWD]   # production Aurora (runs as 'postgres')

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_TARGET="${1:-local}"
PASSWORD_ARG="${2:-}"

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
    export DB_AUTH_MODE="password"
    REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"
    MIGRATE_USER="${DB_USER:-postgres}"

    # If DATABASE_URL is not explicitly configured for prod, resolve endpoint and password
    if [ -z "${DATABASE_URL:-}" ] || [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DATABASE_URL" == *"127.0.0.1"* ]] || [[ "$DATABASE_URL" == *"@db:"* ]]; then
        AWS_BIN="$ROOT_DIR/.venv/bin/aws"
        if [ ! -f "$AWS_BIN" ]; then
            AWS_BIN="aws"
        fi

        echo "Looking up Aurora cluster endpoint from CloudFormation stack 'ChatData'..."
        CLUSTER_ENDPOINT=$("$AWS_BIN" cloudformation describe-stacks \
            --stack-name ChatData \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`ClusterEndpoint`].OutputValue' \
            --output text 2>/dev/null || true)

        if [ -z "$CLUSTER_ENDPOINT" ] || [ "$CLUSTER_ENDPOINT" = "None" ]; then
            echo "Error: Could not retrieve ClusterEndpoint from ChatData stack."
            exit 1
        fi

        # Resolve password for postgres
        POSTGRES_PWD="${PASSWORD_ARG:-${POSTGRES_PASSWORD:-${DB_PASSWORD:-}}}"
        if [ -z "$POSTGRES_PWD" ]; then
            # Prompt securely
            read -s -p "Enter Aurora '$MIGRATE_USER' password: " POSTGRES_PWD
            echo ""
        fi

        if [ -z "$POSTGRES_PWD" ]; then
            echo "Error: Password is required to migrate database."
            exit 1
        fi

        # URL-encode password in case of special characters
        PY_BIN="$ROOT_DIR/.venv/bin/python3"
        if [ ! -f "$PY_BIN" ]; then
            PY_BIN="python3"
        fi
        ENCODED_PWD=$("$PY_BIN" -c "import urllib.parse, sys; print(urllib.parse.quote_plus(sys.argv[1]))" "$POSTGRES_PWD")

        export DATABASE_URL="postgresql+asyncpg://${MIGRATE_USER}:${ENCODED_PWD}@${CLUSTER_ENDPOINT}:5432/chat?ssl=require"
        echo "Connecting to Aurora as '$MIGRATE_USER' with SSL..."
    fi
fi

# Ensure ssl=require is present for remote endpoints
if [[ "${DATABASE_URL:-}" != *"localhost"* ]] && [[ "${DATABASE_URL:-}" != *"127.0.0.1"* ]] && [[ "${DATABASE_URL:-}" != *"@db:"* ]]; then
    if [[ "${DATABASE_URL:-}" != *"ssl="* ]]; then
        if [[ "${DATABASE_URL:-}" == *"?"* ]]; then
            export DATABASE_URL="${DATABASE_URL}&ssl=require"
        else
            export DATABASE_URL="${DATABASE_URL}?ssl=require"
        fi
    fi
fi

cd "$BACKEND_DIR"
$ALEMBIC_BIN upgrade head
echo "Migrations completed successfully."
