"""SQLAlchemy async driver for the Amazon RDS Data API (`postgresql+dataapi://`).

Proof of concept: lets the app reach Aurora over the Data API's HTTPS endpoint, so the
database can live in private subnets with no public IP. See PLAN.md for the rationale.
"""

from sqlalchemy.dialects import registry

registry.register("postgresql.dataapi", "app.db.dataapi.dialect", "PGDialect_dataapi")
