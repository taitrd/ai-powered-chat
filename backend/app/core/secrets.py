"""Load AI provider API keys from SSM Parameter Store at startup.

In production the keys live as SecureString parameters under SECRETS_SSM_PATH (for
example /chat-app/prod/GEMINI_API_KEY), so they never appear in the Lambda
configuration or CloudFormation. Set one with:

    ./backend/scripts/set-ssm.sh GEMINI_API_KEY "<key>"

A key already present in the environment wins, which keeps local development on .env.
Keys are read once per process (Lambda cold start): new values apply to new instances.
"""

import logging
import os

logger = logging.getLogger(__name__)

SECRET_NAMES = ("GEMINI_API_KEY", "OPENAI_API_KEY")


def load_ssm_secrets(client=None) -> list[str]:
    """Copies missing keys from SSM into the environment. Returns the names loaded."""
    path = os.environ.get("SECRETS_SSM_PATH", "")
    if not path:
        return []
    missing = [name for name in SECRET_NAMES if not os.environ.get(name)]
    if not missing:
        return []
    prefix = path if path.endswith("/") else f"{path}/"
    try:
        if client is None:
            import boto3

            client = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        response = client.get_parameters(
            Names=[f"{prefix}{name}" for name in missing], WithDecryption=True
        )
    except Exception:  # noqa: BLE001  Without a key the provider is just inactive.
        logger.exception("Could not load API keys from SSM path %s", prefix)
        return []

    loaded = []
    for parameter in response.get("Parameters", []):
        name = parameter["Name"].removeprefix(prefix)
        if name in missing and parameter.get("Value"):
            os.environ[name] = parameter["Value"]
            loaded.append(name)
    if response.get("InvalidParameters"):
        logger.info("No SSM value for: %s", ", ".join(response["InvalidParameters"]))
    return loaded
