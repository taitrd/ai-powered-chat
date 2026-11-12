"""Daily awake cap guard Lambda.

Runs every 15 minutes. Counts the minutes Aurora Serverless has been awake today (UTC)
from CloudWatch. When the daily cap is reached, it sets the pause switch (an SSM
parameter) to "true": the app then keeps serving the website and cached chats but
refuses chat API calls with a friendly message, so Aurora can pause. On the first run
of a new UTC day the budget resets and the switch goes back to "false".

The switch replaces the old approach of setting the API Lambda's reserved concurrency
to 0, which made AWS answer every request, including the website, with a raw
"Rate Exceeded" error. Any leftover 0 limit is removed.
"""

import os
from datetime import UTC, datetime

import boto3
from botocore.exceptions import ClientError

cloudwatch = boto3.client("cloudwatch")
lambda_client = boto3.client("lambda")
ssm = boto3.client("ssm")

API_FUNCTION_NAME = os.environ.get("API_FUNCTION_NAME", "")
CLUSTER_IDENTIFIER = os.environ.get("CLUSTER_IDENTIFIER", "")
AWAKE_CAP_HOURS = float(os.environ.get("AWAKE_CAP_HOURS", "3"))
PAUSE_PARAMETER_NAME = os.environ.get("PAUSE_PARAMETER_NAME", "")


def awake_minutes_today(now: datetime) -> int:
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    response = cloudwatch.get_metric_data(
        MetricDataQueries=[
            {
                "Id": "capacity",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/RDS",
                        "MetricName": "ServerlessDatabaseCapacity",
                        "Dimensions": [{"Name": "DBClusterIdentifier", "Value": CLUSTER_IDENTIFIER}],
                    },
                    "Period": 60,
                    "Stat": "Maximum",
                },
            }
        ],
        StartTime=start_of_day,
        EndTime=now,
    )
    # Each one-minute datapoint above 0 ACU is one awake minute.
    return sum(1 for v in response["MetricDataResults"][0]["Values"] if v > 0)


def set_paused(paused: bool) -> bool:
    """Writes the switch only when it changes. Returns True if it changed."""
    value = "true" if paused else "false"
    current = ssm.get_parameter(Name=PAUSE_PARAMETER_NAME)["Parameter"]["Value"]
    if current == value:
        return False
    ssm.put_parameter(Name=PAUSE_PARAMETER_NAME, Value=value, Type="String", Overwrite=True)
    return True


def remove_leftover_throttle() -> None:
    """Removes a 0 reserved-concurrency limit left by the previous version of this guard."""
    try:
        lambda_client.delete_function_concurrency(FunctionName=API_FUNCTION_NAME)
    except ClientError as exc:  # Nothing to remove, or not allowed: never block the guard.
        print(f"Could not remove reserved concurrency: {exc}")


def handler(event, context):
    now = datetime.now(UTC)
    awake = awake_minutes_today(now)
    cap = AWAKE_CAP_HOURS * 60
    over_cap = awake >= cap

    remove_leftover_throttle()
    changed = set_paused(over_cap)

    state = "PAUSED" if over_cap else "active"
    note = " (changed)" if changed else ""
    print(f"Aurora awake today: {awake}m of {cap:.0f}m. App is {state}{note}.")
    return {"awake_minutes": awake, "cap_minutes": cap, "paused": over_cap}
