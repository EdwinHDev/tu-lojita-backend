require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pg = require(path.join(__dirname, 'node_modules', 'pg'));

const DEFAULT_RANKING_SETTINGS = {
  lpValues: {
    ORDER_COMPLETED: 15,
    REVIEW_5_STAR: 25,
    REVIEW_4_STAR: 10,
    REVIEW_REPLY: 5,
    ORDER_CANCELLED_BY_SELLER: -20,
    REVIEW_1_2_STAR: -30,
    DISPUTE_OPENED: -25,
    DISPUTE_LOST: -60,
    STRIKE: -100,
    SUBSCRIPTION_DEBT_WEEKLY: -15,
    INACTIVITY_WEEKLY: -20,
    DISPUTE_WON: 20,
    STREAK_10_ORDERS: 40,
    MONTHLY_NO_DISPUTES: 30,
    PROFILE_COMPLETE: 50,
  },
  divisionThresholds: {
    HIERRO: 0,
    BRONCE: 400,
    PLATA: 800,
    ORO: 1300,
    PLATINO: 1900,
    ESMERALDA: 2600,
    DIAMANTE: 3400,
  },
  calibration: {
    ordersRequired: 5,
    lpMultiplier: 2.0,
  },
  antiCheat: {
    accountMinAgeDays: 7,
    buyerCooldownDays: 3,
    clusterWindowDays: 7,
    clusterMinAccounts: 5,
    storeCreationWindowDays: 3,
  },
  inactivity: {
    daysBeforePenalty: 30,
    ironFlagDays: 90,
  },
  maestro: {
    maxStores: 50,
  },
  divisionEmblems: {
    HIERRO: '/assets/ranking/emblems/hierro.png',
    BRONCE: '/assets/ranking/emblems/bronce.png',
    PLATA: '/assets/ranking/emblems/plata.png',
    ORO: '/assets/ranking/emblems/oro.png',
    PLATINO: '/assets/ranking/emblems/platino.png',
    ESMERALDA: '/assets/ranking/emblems/esmeralda.png',
    DIAMANTE: '/assets/ranking/emblems/diamante.png',
    MAESTRO: '/assets/ranking/emblems/maestro.png',
  },
};

const INITIAL_ACHIEVEMENTS = [
  {
    name: 'Primeros Pasos',
    description: 'Completa tu primera orden exitosa en la plataforma.',
    imageUrl: '/assets/ranking/achievements/first_step.png',
    lpBonus: 25,
    category: 'MILESTONES',
    triggerType: 'ORDER_COUNT',
    triggerThreshold: 1,
  },
  {
    name: 'Vendedor Estrella',
    description: 'Completa 10 órdenes exitosas.',
    imageUrl: '/assets/ranking/achievements/star_seller.png',
    lpBonus: 50,
    category: 'MILESTONES',
    triggerType: 'ORDER_COUNT',
    triggerThreshold: 10,
  },
  {
    name: 'Centurión del Comercio',
    description: 'Completa 100 órdenes exitosas.',
    imageUrl: '/assets/ranking/achievements/centurion.png',
    lpBonus: 200,
    category: 'MILESTONES',
    triggerType: 'ORDER_COUNT',
    triggerThreshold: 100,
  },
  {
    name: 'Reputación Impecable',
    description: 'Consigue 10 reseñas de 5 estrellas de compradores satisfechos.',
    imageUrl: '/assets/ranking/achievements/five_stars.png',
    lpBonus: 100,
    category: 'REPUTACION',
    triggerType: 'REVIEW_5_STAR_COUNT',
    triggerThreshold: 10,
  },
  {
    name: 'Paz y Salvo',
    description: 'Mantén tu tienda durante 30 días sin ninguna disputa abierta.',
    imageUrl: '/assets/ranking/achievements/no_disputes.png',
    lpBonus: 50,
    category: 'CONFIABILIDAD',
    triggerType: 'NO_DISPUTES_DAYS',
    triggerThreshold: 30,
  },
  {
    name: 'Perfil Dorado',
    description: 'Completa el perfil de tu tienda con logo, banner y descripción.',
    imageUrl: '/assets/ranking/achievements/gold_profile.png',
    lpBonus: 50,
    category: 'PROGRESION',
    triggerType: 'PROFILE_COMPLETE',
    triggerThreshold: 1,
  },
];

function getDivision(lp) {
  if (lp >= 3400) return 'DIAMANTE';
  if (lp >= 2600) return 'ESMERALDA';
  if (lp >= 1900) return 'PLATINO';
  if (lp >= 1300) return 'ORO';
  if (lp >= 800) return 'PLATA';
  if (lp >= 400) return 'BRONCE';
  return 'HIERRO';
}

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
    console.log('Connected to DB. Running ranking migration...');

    // 1. Execute SQL schema file
    const sqlPath = path.join(__dirname, 'src', 'migrations', 'create-ranking-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('Schema tables and enums created successfully.');

    // 2. Ensure ranking_settings exists
    const settingsCheck = await client.query('SELECT id FROM ranking_settings LIMIT 1');
    if (settingsCheck.rowCount === 0) {
      await client.query(
        `INSERT INTO ranking_settings ("lpValues", "divisionThresholds", calibration, "antiCheat", inactivity, maestro, "divisionEmblems")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          JSON.stringify(DEFAULT_RANKING_SETTINGS.lpValues),
          JSON.stringify(DEFAULT_RANKING_SETTINGS.divisionThresholds),
          JSON.stringify(DEFAULT_RANKING_SETTINGS.calibration),
          JSON.stringify(DEFAULT_RANKING_SETTINGS.antiCheat),
          JSON.stringify(DEFAULT_RANKING_SETTINGS.inactivity),
          JSON.stringify(DEFAULT_RANKING_SETTINGS.maestro),
          JSON.stringify(DEFAULT_RANKING_SETTINGS.divisionEmblems),
        ]
      );
      console.log('Default ranking_settings inserted.');
    } else {
      console.log('Ranking settings already exists.');
    }

    // 3. Ensure initial achievements exist
    for (const ach of INITIAL_ACHIEVEMENTS) {
      const achCheck = await client.query('SELECT id FROM achievement_definitions WHERE name = $1', [ach.name]);
      if (achCheck.rowCount === 0) {
        await client.query(
          `INSERT INTO achievement_definitions (name, description, "imageUrl", "lpBonus", category, "triggerType", "triggerThreshold", "isActive")
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [ach.name, ach.description, ach.imageUrl, ach.lpBonus, ach.category, ach.triggerType, ach.triggerThreshold]
        );
        console.log(`Inserted achievement: ${ach.name}`);
      }
    }

    // 4. Initialize StoreRanking for all existing stores (Task 1.8)
    const storesRes = await client.query('SELECT id, description, logo, "coverImage", strikes, "createdAt" FROM stores');
    console.log(`Found ${storesRes.rowCount} stores to verify/initialize ranking.`);

    for (const store of storesRes.rows) {
      const existingRanking = await client.query('SELECT id FROM store_rankings WHERE "storeId" = $1', [store.id]);
      if (existingRanking.rowCount > 0) {
        console.log(`Store ${store.id} already has ranking record.`);
        continue;
      }

      // Count completed orders
      const ordersRes = await client.query(
        `SELECT count(*) as count, MAX("createdAt") as last_order FROM orders WHERE "storeId" = $1 AND status = 'FULLY_PAID'`,
        [store.id]
      );
      const completedOrders = parseInt(ordersRes.rows[0]?.count || '0', 10);
      const lastActivityDate = ordersRes.rows[0]?.last_order || store.createdAt;

      // Check reviews
      let review5Count = 0;
      let review4Count = 0;
      let review12Count = 0;
      try {
        const revRes = await client.query(
          `SELECT rating, count(*) as count FROM order_reviews WHERE "storeId" = $1 GROUP BY rating`,
          [store.id]
        );
        for (const row of revRes.rows) {
          const r = parseInt(row.rating, 10);
          const c = parseInt(row.count, 10);
          if (r === 5) review5Count += c;
          else if (r === 4) review4Count += c;
          else if (r <= 2) review12Count += c;
        }
      } catch (e) {
        // order_reviews table might differ in schema, handled gracefully
      }

      // Check profile completion
      const isProfileComplete = Boolean(store.logo && store.description);
      const profileBonus = isProfileComplete ? DEFAULT_RANKING_SETTINGS.lpValues.PROFILE_COMPLETE : 0;

      // Base LP
      const calculatedLP = Math.max(
        0,
        completedOrders * DEFAULT_RANKING_SETTINGS.lpValues.ORDER_COMPLETED +
        review5Count * DEFAULT_RANKING_SETTINGS.lpValues.REVIEW_5_STAR +
        review4Count * DEFAULT_RANKING_SETTINGS.lpValues.REVIEW_4_STAR +
        profileBonus -
        (store.strikes || 0) * Math.abs(DEFAULT_RANKING_SETTINGS.lpValues.STRIKE)
      );

      const division = getDivision(calculatedLP);
      const isCalibrating = completedOrders < DEFAULT_RANKING_SETTINGS.calibration.ordersRequired;
      const calibrationOrdersCompleted = Math.min(completedOrders, DEFAULT_RANKING_SETTINGS.calibration.ordersRequired);

      await client.query(
        `INSERT INTO store_rankings ("storeId", "currentLP", division, "isCalibrating", "calibrationOrdersCompleted", "isFlagged", "lastActivityDate")
         VALUES ($1, $2, $3, $4, $5, false, $6)`,
        [store.id, calculatedLP, division, isCalibrating, calibrationOrdersCompleted, lastActivityDate]
      );

      // Record an initial ranking event for audit
      if (calculatedLP > 0) {
        await client.query(
          `INSERT INTO ranking_events ("storeId", "eventType", "lpDelta", metadata)
           VALUES ($1, 'MANUAL_ADJUSTMENT', $2, $3)`,
          [store.id, calculatedLP, JSON.stringify({ reason: 'Initial LP calculation from history' })]
        );
      }

      console.log(`Initialized ranking for store ${store.id}: ${calculatedLP} LP (${division})`);
    }

    console.log('Migration and initial ranking completed successfully!');
    await client.end();
  } catch (err) {
    console.error('Migration error:', err);
    if (client) await client.end();
    process.exit(1);
  }
}

main();
