"""service photos gallery and image fit

Revision ID: 326c2be7538c
Revises: 145ad41c969f
Create Date: 2026-10-31 14:39:29.823477

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '326c2be7538c'
down_revision: Union[str, Sequence[str], None] = '145ad41c969f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('service_images',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('service_id', sa.Integer(), nullable=False),
    sa.Column('url', sa.String(length=500), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['service_id'], ['salon_services.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_service_images_service_id'), 'service_images', ['service_id'], unique=False)

    # batch mode so the CHECK constraint can also be added on SQLite
    with op.batch_alter_table('salon_services') as batch:
        batch.add_column(sa.Column('image_fit', sa.String(length=10), server_default='cover', nullable=False))
        batch.create_check_constraint('ck_salon_service_image_fit', "image_fit IN ('cover', 'contain')")

    # photos uploaded before this migration (one per service) become the first gallery photo
    op.execute(
        "INSERT INTO service_images (service_id, url, position) "
        "SELECT id, image_url, 0 FROM salon_services WHERE image_url IS NOT NULL"
    )


def downgrade() -> None:
    """Downgrade schema. salon_services.image_url still holds each cover photo."""
    with op.batch_alter_table('salon_services') as batch:
        batch.drop_constraint('ck_salon_service_image_fit', type_='check')
        batch.drop_column('image_fit')
    op.drop_index(op.f('ix_service_images_service_id'), table_name='service_images')
    op.drop_table('service_images')
