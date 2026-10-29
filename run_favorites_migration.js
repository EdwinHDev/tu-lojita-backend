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
    console.log('Connected to PostgreSQL database. Applying favorites migration...');

    // 1. Add favorites_count column to items table if not exists
    await client.query(`
      ALTER TABLE IF EXISTS items
      ADD COLUMN IF NOT EXISTS "favoritesCount" integer NOT NULL DEFAULT 0;
    `);
    console.log('Column items."favoritesCount" verified/created.');

    // 2. Create item_favorites table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_favorites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "itemId" uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        "priceWhenAdded" numeric NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT uq_item_favorites_user_item UNIQUE ("userId", "itemId")
      );
    `);
    console.log('Table "item_favorites" verified/created with constraints.');

    // 3. Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_favorites_user_id ON item_favorites ("userId");
      CREATE INDEX IF NOT EXISTS idx_item_favorites_item_id ON item_favorites ("itemId");
    `);
    console.log('Indexes on "item_favorites" verified/created.');

    await client.end();
    console.log('Favorites migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
