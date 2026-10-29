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
    console.log('Connected to PostgreSQL database. Applying company & store migration...');

    await client.query(`
      ALTER TABLE IF EXISTS companies
      ADD COLUMN IF NOT EXISTS "phone" text,
      ADD COLUMN IF NOT EXISTS "description" text;
    `);
    console.log('Columns companies.phone and companies.description verified/created.');

    await client.query(`
      ALTER TABLE IF EXISTS stores
      ADD COLUMN IF NOT EXISTS "instagram" text,
      ADD COLUMN IF NOT EXISTS "tiktok" text;
    `);
    console.log('Columns stores.instagram and stores.tiktok verified/created.');

    await client.end();
    console.log('Migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
