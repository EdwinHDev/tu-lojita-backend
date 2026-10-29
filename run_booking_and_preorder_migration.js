const path = require('path');
const fs = require('fs');
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
    console.log('Connected to PostgreSQL database. Applying booking and preorder tables migration...');

    const sqlPath = path.join(__dirname, 'src', 'migrations', 'create-booking-and-preorder-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log('Tables, enums and indexes for bookings and pre-orders verified/created successfully.');

    await client.end();
    console.log('Migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
