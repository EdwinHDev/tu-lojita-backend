const path = require('path');
const pg = require(path.join(__dirname, 'node_modules', 'pg'));

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '289932918276521235064',
    database: process.env.DB_NAME || 'tu-lojita',
  });

  try {
    await client.connect();
    console.log('Connected to DB. Applying schema updates...');

    // 1. Add REJECTED to orders_status_enum if not exists
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_status_enum') THEN
          ALTER TYPE orders_status_enum ADD VALUE IF NOT EXISTS 'REJECTED';
        END IF;
      END$$;
    `);
    console.log('Enum orders_status_enum updated with REJECTED.');

    // 2. Drop NOT NULL on installments dueDate
    await client.query(`
      ALTER TABLE IF EXISTS installments
      ALTER COLUMN "dueDate" DROP NOT NULL;
    `);
    console.log('Installments.dueDate set to nullable.');

    // 3. Add imageUrl to chat_messages if not exists
    await client.query(`
      ALTER TABLE IF EXISTS chat_messages
      ADD COLUMN IF NOT EXISTS "imageUrl" text;
    `);
    console.log('chat_messages.imageUrl column verified.');

    await client.end();
    console.log('Schema updates completed successfully.');
  } catch (err) {
    console.error('Error applying schema updates:', err.message);
    if (client) await client.end();
  }
}

main();
