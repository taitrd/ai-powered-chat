"""Daily awake cap guard Lambda.

Runs on an EventBridge schedule every 15 minutes. Reads CloudWatch metrics
to calculate Aurora Serverless awake time. If the cap is reached, throttles
the API Lambda by setting reserved concurrency to 0 so Aurora can pause.
Restores concurrency on the first run of a new UTC day.
"""

from datetime import datetime, timezone
import os

import boto3

cloudwatch = boto3.client("cloudwatch")
lambda_client = boto3.client("lambda")

API_FUNCTION_NAME = os.environ.get("API_FUNCTION_NAME", "")
CLUSTER_IDENTIFIER = os.environ.get("CLUSTER_IDENTIFIER", "")
AWAKE_CAP_HOURS = float(os.environ.get("AWAKE_CAP_HOURS", "3"))


def handler(event, context):
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Query CloudWatch for ServerlessDatabaseCapacity > 0 datapoints today
    response = cloudwatch.get_metric_data(
        MetricDataQueries=[
            {
                "Id": "capacity",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/RDS",
                        "MetricName": "ServerlessDatabaseCapacity",
                        "Dimensions": [
                            {"Name": "DBClusterIdentifier", "Value": CLUSTER_IDENTIFIER}
                        ],
                    },
                    "Period": 60,
                    "Stat": "Maximum",
                },
            }
        ],
        StartTime=start_of_day,
        EndTime=now,
    )

    values = response["MetricDataResults"][0]["Values"]
    # Each datapoint > 0 represents 1 active minute
    awake_minutes = sum(1 for v in values if v > 0)
    cap_minutes = AWAKE_CAP_HOURS * 60

    print(f"Aurora awake time today: {awake_minutes}m / {cap_minutes}m limit")

    if awake_minutes >= cap_minutes:
        print(f"Daily cap reached ({awake_minutes}m >= {cap_minutes}m). Setting concurrency to 0.")
        lambda_client.put_function_concurrency(
            FunctionName=API_FUNCTION_NAME,
            ReservedConcurrentExecutions=0,
        )
    else:
        # If it was previously capped and now a new day, remove 0-concurrency cap
        print(f"Within budget ({awake_minutes}m < {cap_minutes}m). Ensuring concurrency is active.")
        try:
            lambda_client.delete_function_concurrency(FunctionName=API_FUNCTION_NAME)
        except lambda_client.exceptions.ClientError:
            pass

    return {"awake_minutes": awake_minutes, "cap_minutes": cap_minutes}
