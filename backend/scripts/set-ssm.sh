#!/usr/bin/env bash
set -euo pipefail

# Store secrets and configurations in AWS Systems Manager (SSM) Parameter Store
#
# Usage:
#   ./backend/scripts/set-ssm.sh <KEY_NAME> <KEY_VALUE> [TYPE]
#   ./backend/scripts/set-ssm.sh <KEY_NAME>               # pulls value from .env
#   ./backend/scripts/set-ssm.sh                          # defaults to GEMINI_API_KEY from .env
#
# Examples:
#   ./backend/scripts/set-ssm.sh GEMINI_API_KEY "AIzaSy..."
#   ./backend/scripts/set-ssm.sh OPENAI_API_KEY "sk-proj-..."
#   ./backend/scripts/set-ssm.sh ANTHROPIC_API_KEY "sk-ant-..."
#   ./backend/scripts/set-ssm.sh /chat-app/prod/CUSTOM_SECRET "my-secret"
#   ./backend/scripts/set-ssm.sh GEMINI_API_KEY           # reads from .env
#   ./backend/scripts/set-ssm.sh APP_LOG_LEVEL "DEBUG" String

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

# Use venv aws or system aws
AWS_BIN="$ROOT_DIR/.venv/bin/aws"
if [ ! -f "$AWS_BIN" ]; then
    AWS_BIN="aws"
fi

ARG1="${1:-}"
ARG2="${2:-}"
PARAM_TYPE="${3:-SecureString}"

if [ "$ARG1" = "-h" ] || [ "$ARG1" = "--help" ]; then
    cat << 'EOF'
Usage: ./backend/scripts/set-ssm.sh [KEY_NAME] [KEY_VALUE] [TYPE]

Arguments:
  KEY_NAME    Parameter name (e.g. GEMINI_API_KEY, OPENAI_API_KEY, or /custom/path)
              If name does not start with '/', it is prefixed with '/chat-app/prod/'.
              Defaults to: GEMINI_API_KEY
  KEY_VALUE   Parameter value (if omitted, reads $KEY_NAME from .env)
  TYPE        Parameter type: SecureString (default), String, or StringList

Examples:
  ./backend/scripts/set-ssm.sh GEMINI_API_KEY "AIzaSy..."
  ./backend/scripts/set-ssm.sh OPENAI_API_KEY "sk-..."
  ./backend/scripts/set-ssm.sh GEMINI_API_KEY            # pulls GEMINI_API_KEY from .env
  ./backend/scripts/set-ssm.sh                           # defaults to GEMINI_API_KEY from .env
  ./backend/scripts/set-ssm.sh /my/custom/path "val" String
EOF
    exit 0
fi

if [ -z "$ARG1" ]; then
    # No args: default to GEMINI_API_KEY from .env
    KEY_NAME="GEMINI_API_KEY"
    KEY_VALUE="${GEMINI_API_KEY:-}"
elif [ -n "$ARG1" ] && [ -z "$ARG2" ]; then
    # 1 arg provided:
    # Check if ARG1 is an env variable name present in .env
    ENV_VAL="${!ARG1:-}"
    if [ -n "$ENV_VAL" ]; then
        KEY_NAME="$ARG1"
        KEY_VALUE="$ENV_VAL"
    else
        # If ARG1 is not set in env, check if it looks like a variable name vs a raw value
        if [[ "$ARG1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            echo "Error: Environment variable '$ARG1' is empty or not set in .env."
            echo "Usage: ./backend/scripts/set-ssm.sh $ARG1 <value>"
            exit 1
        else
            # Passed a raw key value for GEMINI_API_KEY
            KEY_NAME="GEMINI_API_KEY"
            KEY_VALUE="$ARG1"
        fi
    fi
else
    # 2 or more args: ARG1 is name, ARG2 is value
    KEY_NAME="$ARG1"
    KEY_VALUE="$ARG2"
fi

if [ -z "$KEY_VALUE" ]; then
    echo "Error: Value for '$KEY_NAME' is empty or not provided."
    echo "Usage: ./backend/scripts/set-ssm.sh <KEY_NAME> <KEY_VALUE> [TYPE]"
    exit 1
fi

# Format SSM Parameter path
if [[ "$KEY_NAME" == /* ]]; then
    SSM_PARAM_NAME="$KEY_NAME"
else
    SSM_PARAM_NAME="/chat-app/prod/$KEY_NAME"
fi

REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"

echo "Storing SSM parameter ($PARAM_TYPE):"
echo "  Name:   $SSM_PARAM_NAME"
echo "  Region: $REGION"

"$AWS_BIN" ssm put-parameter \
    --region "$REGION" \
    --type "$PARAM_TYPE" \
    --name "$SSM_PARAM_NAME" \
    --value "$KEY_VALUE" \
    --overwrite

echo "SSM parameter '$SSM_PARAM_NAME' stored successfully."
