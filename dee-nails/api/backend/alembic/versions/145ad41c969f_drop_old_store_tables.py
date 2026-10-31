"""drop old store tables

Revision ID: 145ad41c969f
Revises: 77e5316b27e0
Create Date: 2026-10-27 18:54:43.137194

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '145ad41c969f'
down_revision: Union[str, Sequence[str], None] = '77e5316b27e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    DESTRUCTIVE: permanently deletes the old online-store tables (products,
    categories, carts, orders, payments, reviews) and everything in them.
    The Dee Nails app no longer uses any of them. Back up your database first
    if it holds anything you want to keep, or delete this migration file to
    leave those tables alone.

    Order matters on MySQL: a table can't be dropped while another table still
    points at it, so children go first.
    """
    op.drop_index(op.f('ix_payments_checkout_request_id'), table_name='payments')
    op.drop_table('payments')       # -> orders
    op.drop_table('reviews')        # -> products, user
    op.drop_table('order_items')    # -> orders, products
    op.drop_table('cart_items')     # -> cart, products
    op.drop_table('orders')         # -> user
    op.drop_table('cart')           # -> user
    op.drop_table('products')       # -> category
    op.drop_table('category')


def downgrade() -> None:
    """Downgrade schema."""
    # restores the empty tables (NOT their data); parents first
    op.create_table('category',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('name', sa.VARCHAR(length=100), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('products',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('category_id', sa.INTEGER(), nullable=False),
    sa.Column('name', sa.VARCHAR(length=100), nullable=False),
    sa.Column('description', sa.VARCHAR(length=500), nullable=False),
    sa.Column('image_url', sa.VARCHAR(length=500), nullable=True),
    sa.Column('price', sa.NUMERIC(precision=10, scale=2), nullable=False),
    sa.Column('stock', sa.INTEGER(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.CheckConstraint('price >= 0', name=op.f('ck_product_price_nonnegative')),
    sa.CheckConstraint('stock >= 0', name=op.f('ck_product_stock_nonnegative')),
    sa.ForeignKeyConstraint(['category_id'], ['category.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('cart',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('user_id', sa.VARCHAR(length=50), nullable=False),
    sa.Column('created_at', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('orders',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('user_id', sa.VARCHAR(length=50), nullable=False),
    sa.Column('total_amount', sa.NUMERIC(precision=10, scale=2), nullable=False),
    sa.Column('status', sa.VARCHAR(length=10), nullable=False),
    sa.Column('is_active', sa.BOOLEAN(), nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('cancelled_at', sa.TIMESTAMP(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('cart_items',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('cart_id', sa.INTEGER(), nullable=False),
    sa.Column('product_id', sa.INTEGER(), nullable=False),
    sa.Column('quantity', sa.INTEGER(), nullable=False),
    sa.ForeignKeyConstraint(['cart_id'], ['cart.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('cart_id', 'product_id', name=op.f('uq_cart_product'))
    )
    op.create_table('reviews',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('product_id', sa.INTEGER(), nullable=False),
    sa.Column('user_id', sa.VARCHAR(length=50), nullable=False),
    sa.Column('comment', sa.VARCHAR(length=500), nullable=False),
    sa.Column('stars', sa.INTEGER(), nullable=False),
    sa.Column('created_at', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.CheckConstraint('stars >= 1 AND stars <= 5', name=op.f('ck_review_stars_range')),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('order_items',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('order_id', sa.INTEGER(), nullable=False),
    sa.Column('product_id', sa.INTEGER(), nullable=False),
    sa.Column('quantity', sa.INTEGER(), nullable=False),
    sa.Column('price', sa.NUMERIC(precision=10, scale=2), nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('payments',
    sa.Column('id', sa.VARCHAR(length=50), nullable=False),
    sa.Column('order_id', sa.INTEGER(), nullable=False),
    sa.Column('phone_number', sa.VARCHAR(length=20), nullable=False),
    sa.Column('amount', sa.NUMERIC(precision=10, scale=2), nullable=False),
    sa.Column('method', sa.VARCHAR(length=5), nullable=False),
    sa.Column('status', sa.VARCHAR(length=7), nullable=False),
    sa.Column('checkout_request_id', sa.VARCHAR(length=100), nullable=True),
    sa.Column('merchant_request_id', sa.VARCHAR(length=100), nullable=True),
    sa.Column('mpesa_receipt_number', sa.VARCHAR(length=100), nullable=True),
    sa.Column('paid_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payments_checkout_request_id'), 'payments', ['checkout_request_id'], unique=1)
