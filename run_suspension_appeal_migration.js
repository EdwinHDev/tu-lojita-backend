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
    console.log('Connected to PostgreSQL database. Applying suspension appeals migration...');

    await client.query(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suspension_appeals_status_enum') THEN
              CREATE TYPE "suspension_appeals_status_enum" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
          END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS suspension_appeals (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
          "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
          "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason text NOT NULL,
          "evidenceUrls" text[] DEFAULT '{}' NOT NULL,
          "contactPhone" text,
          status "suspension_appeals_status_enum" DEFAULT 'PENDING' NOT NULL,
          "adminNotes" text,
          "reviewedById" uuid REFERENCES users(id) ON DELETE SET NULL,
          "reviewedAt" timestamp with time zone
      );

      CREATE INDEX IF NOT EXISTS "IDX_suspension_appeals_userId" ON suspension_appeals("userId");
      CREATE INDEX IF NOT EXISTS "IDX_suspension_appeals_status" ON suspension_appeals(status);
    `);
    console.log('Table "suspension_appeals" verified/created.');

    await client.end();
    console.log('Suspension appeals migration executed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
