"""Conversation message counter and daily usage counters (PLAN.md, M7).

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Backward compatible: the default lets code that predates this column keep inserting.
    op.add_column(
        "conversations",
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        "UPDATE conversations c SET message_count = "
        "(SELECT count(*) FROM messages m WHERE m.conversation_id = c.id)"
    )
    op.create_table(
        "daily_usage",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("messages", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("day", "user_id"),
    )
    # Unique (created_at, id) keyset pagination of one chat's messages.
    op.create_index(
        "ix_messages_conversation_created_id",
        "messages",
        ["conversation_id", "created_at", "id"],
    )
    op.drop_index("ix_messages_conversation_created", table_name="messages")


def downgrade() -> None:
    op.create_index(
        "ix_messages_conversation_created", "messages", ["conversation_id", "created_at"]
    )
    op.drop_index("ix_messages_conversation_created_id", table_name="messages")
    op.drop_table("daily_usage")
    op.drop_column("conversations", "message_count")
