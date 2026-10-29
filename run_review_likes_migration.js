const path = require('path');
const pg = require(path.join(__dirname, 'node_modules', 'pg'));
require('dotenv').config();

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '289932918276521235064',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'tu-lojita',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database. Applying review likes migration...');

    // 1. Add likesCount column to order_reviews
    await client.query(`
      ALTER TABLE IF EXISTS order_reviews
      ADD COLUMN IF NOT EXISTS "likesCount" integer NOT NULL DEFAULT 0;
    `);
    console.log('Column order_reviews."likesCount" verified/created.');

    // 2. Create order_review_likes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_review_likes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "reviewId" UUID NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_order_review_likes_review_user UNIQUE ("reviewId", "userId")
      );
    `);
    console.log('Table "order_review_likes" verified/created with constraints.');

    // 3. Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_review_likes_review ON order_review_likes("reviewId");
      CREATE INDEX IF NOT EXISTS idx_order_review_likes_user ON order_review_likes("userId");
    `);
    console.log('Indexes on "order_review_likes" verified/created.');

    await client.end();
    console.log('✓ Review likes migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
