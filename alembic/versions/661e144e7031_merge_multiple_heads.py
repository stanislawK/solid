"""merge multiple heads

Revision ID: 661e144e7031
Revises: 1d76db050b65, b6f6e4d2c8aa
Create Date: 2026-04-04 21:43:06.184026

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "661e144e7031"
down_revision: Union[str, None] = ("1d76db050b65", "b6f6e4d2c8aa")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
