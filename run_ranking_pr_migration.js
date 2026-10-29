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
    console.log('Connected to PostgreSQL. Running ranking PR column migration...');

    await client.query(`
      DO $$
      BEGIN
        -- 1. Rename currentLP to currentPR in store_rankings
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'store_rankings' AND column_name = 'currentLP'
        ) THEN
          ALTER TABLE store_rankings RENAME COLUMN "currentLP" TO "currentPR";
          RAISE NOTICE 'Renamed currentLP to currentPR in store_rankings';
        END IF;

        -- 2. Rename lpDelta to prDelta in ranking_events
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'ranking_events' AND column_name = 'lpDelta'
        ) THEN
          ALTER TABLE ranking_events RENAME COLUMN "lpDelta" TO "prDelta";
          RAISE NOTICE 'Renamed lpDelta to prDelta in ranking_events';
        END IF;

        -- 3. Rename index if exists
        IF EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = 'store_rankings' AND indexname = 'idx_store_rankings_currentlp'
        ) THEN
          ALTER INDEX idx_store_rankings_currentlp RENAME TO idx_store_rankings_currentpr;
          RAISE NOTICE 'Renamed index to idx_store_rankings_currentpr';
        END IF;
      END $$;
    `);

    console.log('✓ Ranking PR columns and indices verified/migrated successfully.');
    await client.end();
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
