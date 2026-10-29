const path = require('path');
const pg = require(path.join(__dirname, 'node_modules', 'pg'));
require('dotenv').config();

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await client.connect();
    console.log(`Connected to PostgreSQL database "${process.env.DB_NAME}". Applying variant color images migration...`);

    await client.query(`
      ALTER TABLE IF EXISTS item_variants
      ADD COLUMN IF NOT EXISTS "imageUrl" text;
    `);
    console.log('Column "imageUrl" verified/created in item_variants table.');

    await client.end();
    console.log('Variant color images migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
