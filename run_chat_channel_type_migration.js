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
    console.log('Connected to PostgreSQL database. Applying channelType migration on chat_messages...');

    await client.query(`
      ALTER TABLE IF EXISTS chat_messages
      ADD COLUMN IF NOT EXISTS "channelType" varchar(32) DEFAULT 'DIRECT';

      CREATE INDEX IF NOT EXISTS idx_chat_messages_order_channel
      ON chat_messages("orderId", "channelType");
    `);
    console.log('Column "channelType" and index verified/created.');

    await client.end();
    console.log('Migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
