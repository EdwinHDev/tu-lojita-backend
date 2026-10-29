const path = require('path');
const pg = require(path.join(__dirname, 'node_modules', 'pg'));
require('dotenv').config();

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '289932918276521235064',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'tu_lojita_backend',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database. Applying verdict and penalty migration on order_disputes...');

    await client.query(`
      ALTER TABLE IF EXISTS order_disputes
      ADD COLUMN IF NOT EXISTS "verdict" varchar(32) NULL,
      ADD COLUMN IF NOT EXISTS "buyerPenalty" varchar(32) DEFAULT 'NONE',
      ADD COLUMN IF NOT EXISTS "merchantPenalty" varchar(32) DEFAULT 'NONE',
      ADD COLUMN IF NOT EXISTS "resolvedByUserId" uuid NULL;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_disputes_resolved_by_user'
        ) THEN
          ALTER TABLE order_disputes
          ADD CONSTRAINT fk_order_disputes_resolved_by_user
          FOREIGN KEY ("resolvedByUserId")
          REFERENCES users(id)
          ON DELETE SET NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_order_disputes_verdict ON order_disputes("verdict");
    `);
    console.log('Columns verdict, buyerPenalty, merchantPenalty and resolvedByUserId verified/created.');

    await client.end();
    console.log('Migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
