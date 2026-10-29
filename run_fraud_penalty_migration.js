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
    console.log('Connected to PostgreSQL database. Applying fraud penalty columns migration...');

    await client.query(`
      ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS "consecutiveRejectedPaymentsCount" integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "lastRejectedPaymentAt" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "consecutiveApprovedPaymentsCount" integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "accountSuspendedUntil" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "accountSuspensionReason" text;
    `);
    console.log('Fraud penalty columns verified/created in "users" table.');

    await client.end();
    console.log('Migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
