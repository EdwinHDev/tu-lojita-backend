const path = require('path');
const fs = require('fs');
const pg = require(path.join(__dirname, 'node_modules', 'pg'));

require('dotenv').config();

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'tu-lojita',
  });

  try {
    await client.connect();
    console.log(
      'Connected to PostgreSQL database. Applying Store AI Image Enhancement migration...',
    );

    const sqlPath = path.join(
      __dirname,
      'src',
      'migrations',
      'create-store-ai-image-tables.sql',
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log(
      'Tables (ai_prompt_presets, store_ai_settings, collaborator_ai_branches) and platform settings verified/created successfully.',
    );

    await client.end();
    console.log('Migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
