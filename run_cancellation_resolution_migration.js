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
    console.log('Connected to PostgreSQL database. Applying cancellation resolution migration...');

    // 1. Add cancellation resolution columns to orders table if not exists
    await client.query(`
      ALTER TABLE IF EXISTS orders
      ADD COLUMN IF NOT EXISTS "cancellationResolutionConfirmed" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "cancellationResolvedAt" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "cancellationResolutionStatus" character varying(50) NOT NULL DEFAULT 'NONE',
      ADD COLUMN IF NOT EXISTS "cancellationResolutionProposedBy" character varying(20),
      ADD COLUMN IF NOT EXISTS "cancellationResolutionProposedAt" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "cancellationResolutionNotes" text,
      ADD COLUMN IF NOT EXISTS "cancellationResolutionReminderSentAt" timestamp with time zone;
    `);
    console.log('All cancellation resolution columns verified/created.');

    await client.end();
    console.log('Cancellation resolution migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
