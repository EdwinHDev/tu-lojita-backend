-- Migration: Add review likes table and likesCount column to order_reviews
ALTER TABLE order_reviews ADD COLUMN IF NOT EXISTS "likesCount" integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS order_review_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "reviewId" UUID NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_order_review_likes_review_user UNIQUE ("reviewId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_order_review_likes_review ON order_review_likes("reviewId");
CREATE INDEX IF NOT EXISTS idx_order_review_likes_user ON order_review_likes("userId");
