const path = require('path');
try {
  require(path.join(__dirname, 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '.env') });
} catch (_) {}
const pg = require(path.join(__dirname, 'node_modules', 'pg'));
const bcrypt = require(path.join(__dirname, 'node_modules', 'bcrypt'));

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '289932918276521235064',
    database: process.env.DB_NAME || 'tu_lojita_backend',
  });

  console.log('Connecting to PostgreSQL database for reviewer seed...');
  await client.connect();

  try {
    const rawPassword = 'DemoReview2026!';
    const hashedPassword = bcrypt.hashSync(rawPassword, 10);

    // 1. Client Reviewer (demo.client@tulojita.com)
    console.log('1. Provisioning Client Reviewer (demo.client@tulojita.com)...');
    let clientRes = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = $1',
      ['demo.client@tulojita.com']
    );

    let clientUserId;
    if (clientRes.rows.length === 0) {
      const insertClient = await client.query(
        `INSERT INTO users (
          id, "firstName", "lastName", email, password, "isActive", confirm, role, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'Carlos', 'Mendoza', 'demo.client@tulojita.com', $1, true, true, 'USER', NOW(), NOW()
        ) RETURNING id`,
        [hashedPassword]
      );
      clientUserId = insertClient.rows[0].id;
      console.log('   -> Client demo account created with ID:', clientUserId);
    } else {
      clientUserId = clientRes.rows[0].id;
      await client.query(
        `UPDATE users 
         SET "firstName" = 'Carlos', "lastName" = 'Mendoza', password = $1, "isActive" = true, confirm = true, role = 'USER', "updatedAt" = NOW()
         WHERE id = $2`,
        [hashedPassword, clientUserId]
      );
      console.log('   -> Client demo account updated with ID:', clientUserId);
    }

    // 2. Business Reviewer (demo.business@tulojita.com)
    console.log('2. Provisioning Business Reviewer (demo.business@tulojita.com)...');
    let bizRes = await client.query(
      'SELECT id, "companyId", "storeId" FROM users WHERE LOWER(email) = $1',
      ['demo.business@tulojita.com']
    );

    let bizUserId;
    let bizCompanyId;
    let bizStoreId;

    if (bizRes.rows.length === 0) {
      const insertBiz = await client.query(
        `INSERT INTO users (
          id, "firstName", "lastName", email, password, "isActive", confirm, role, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'Gerencia', 'Ferretería El Tornillo', 'demo.business@tulojita.com', $1, true, true, 'COMPANY', NOW(), NOW()
        ) RETURNING id, "companyId", "storeId"`,
        [hashedPassword]
      );
      bizUserId = insertBiz.rows[0].id;
      bizCompanyId = insertBiz.rows[0].companyId;
      bizStoreId = insertBiz.rows[0].storeId;
      console.log('   -> Business demo account created with ID:', bizUserId);
    } else {
      bizUserId = bizRes.rows[0].id;
      bizCompanyId = bizRes.rows[0].companyId;
      bizStoreId = bizRes.rows[0].storeId;
      await client.query(
        `UPDATE users 
         SET "firstName" = 'Gerencia', "lastName" = 'Ferretería El Tornillo', password = $1, "isActive" = true, confirm = true, role = 'COMPANY', "updatedAt" = NOW()
         WHERE id = $2`,
        [hashedPassword, bizUserId]
      );
      console.log('   -> Business demo account updated with ID:', bizUserId);
    }

    // 3. Company
    console.log('3. Provisioning Company for Business Reviewer...');
    const compLogo = '/img/6ef12027-ac98-4f9e-928a-4df08b33632b';
    const compName = 'Ferretería El Tornillo, C.A.';
    const compRif = 'J-40918234-1';

    let compRes = await client.query(
      'SELECT id FROM companies WHERE "ownerId" = $1 OR id = $2 OR name ILIKE $3 LIMIT 1',
      [bizUserId, bizCompanyId || '00000000-0000-0000-0000-000000000000', '%Tornillo%']
    );

    if (compRes.rows.length === 0) {
      const insertComp = await client.query(
        `INSERT INTO companies (
          id, name, rif, logo, "ownerId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW()
        ) RETURNING id`,
        [compName, compRif, compLogo, bizUserId]
      );
      bizCompanyId = insertComp.rows[0].id;
      console.log('   -> Demo Company created with ID:', bizCompanyId);
    } else {
      bizCompanyId = compRes.rows[0].id;
      await client.query(
        `UPDATE companies 
         SET name = $1, rif = $2, logo = $3, "ownerId" = $4, "updatedAt" = NOW()
         WHERE id = $5`,
        [compName, compRif, compLogo, bizUserId, bizCompanyId]
      );
      console.log('   -> Existing Demo Company updated with ID:', bizCompanyId);
    }

    await client.query(
      'UPDATE users SET "companyId" = $1 WHERE id = $2',
      [bizCompanyId, bizUserId]
    );

    // 4. Active Subscription in company_subscriptions
    console.log('4. Provisioning Active Subscription for Demo Company...');
    let subRes = await client.query(
      'SELECT id FROM company_subscriptions WHERE "companyId" = $1 OR "ownerId" = $2 LIMIT 1',
      [bizCompanyId, bizUserId]
    );

    const periodStart = new Date();
    const periodEnd = new Date('2027-12-31T23:59:59.000Z');
    const graceEnd = new Date('2028-01-05T23:59:59.000Z');

    if (subRes.rows.length === 0) {
      await client.query(
        `INSERT INTO company_subscriptions (
          id, "monthlyFee", status, "currentPeriodStart", "currentPeriodEnd", "gracePeriodEnd", "accumulatedDebt", "nextBillingDate", "companyId", "ownerId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 20.00, 'ACTIVE', $1, $2, $3, 0.00, $2, $4, $5, NOW(), NOW()
        )`,
        [periodStart, periodEnd, graceEnd, bizCompanyId, bizUserId]
      );
      console.log('   -> Active Subscription created successfully (Valid until 2027-12-31)');
    } else {
      await client.query(
        `UPDATE company_subscriptions
         SET status = 'ACTIVE', "monthlyFee" = 20.00, "currentPeriodStart" = $1, "currentPeriodEnd" = $2, "gracePeriodEnd" = $3, "accumulatedDebt" = 0.00, "nextBillingDate" = $2, "companyId" = $4, "ownerId" = $5, "updatedAt" = NOW()
         WHERE id = $6`,
        [periodStart, periodEnd, graceEnd, bizCompanyId, bizUserId, subRes.rows[0].id]
      );
      console.log('   -> Existing Subscription renewed to ACTIVE (Valid until 2027-12-31)');
    }

    // 5. Subcategory lookup
    console.log('5. Finding Ferretería Subcategory...');
    let subcatRes = await client.query(
      "SELECT id FROM subcategories WHERE name ILIKE '%Ferreter%' LIMIT 1"
    );
    let subcatId = subcatRes.rows.length > 0 ? subcatRes.rows[0].id : null;

    if (!subcatId) {
      let anySub = await client.query('SELECT id FROM subcategories LIMIT 1');
      subcatId = anySub.rows.length > 0 ? anySub.rows[0].id : null;
    }
    console.log('   -> Using Subcategory ID:', subcatId);

    // 6. Store
    console.log('6. Provisioning Store for Business Reviewer...');
    const storeName = 'Ferretería El Tornillo';
    const storeSlug = 'ferreteria-el-tornillo';
    const storeDesc = 'Herramientas profesionales, tornillería, plomería, electricidad y materiales para la construcción y el hogar.';
    const storePhone = '+584145551234';

    let storeRes = await client.query(
      'SELECT id FROM stores WHERE "companyId" = $1 OR "ownerId" = $2 OR slug = $3 LIMIT 1',
      [bizCompanyId, bizUserId, storeSlug]
    );

    if (storeRes.rows.length === 0) {
      const insertStore = await client.query(
        `INSERT INTO stores (
          id, name, slug, description, rif, phone, logo, "companyId", "ownerId", "subcategoryId", status, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', NOW(), NOW()
        ) RETURNING id`,
        [storeName, storeSlug, storeDesc, compRif, storePhone, compLogo, bizCompanyId, bizUserId, subcatId]
      );
      bizStoreId = insertStore.rows[0].id;
      console.log('   -> Demo Store created with ID:', bizStoreId);
    } else {
      bizStoreId = storeRes.rows[0].id;
      await client.query(
        `UPDATE stores 
         SET name = $1, slug = $2, description = $3, rif = $4, phone = $5, logo = $6, "companyId" = $7, "ownerId" = $8, "subcategoryId" = $9, status = 'ACTIVE', "updatedAt" = NOW()
         WHERE id = $10`,
        [storeName, storeSlug, storeDesc, compRif, storePhone, compLogo, bizCompanyId, bizUserId, subcatId, bizStoreId]
      );
      console.log('   -> Existing Demo Store updated with ID:', bizStoreId);
    }

    await client.query(
      'UPDATE users SET "storeId" = $1 WHERE id = $2',
      [bizStoreId, bizUserId]
    );

    // 7. Store Address
    console.log('7. Provisioning Store Address...');
    let addrRes = await client.query(
      'SELECT id FROM store_addresses WHERE "storeId" = $1 LIMIT 1',
      [bizStoreId]
    );

    if (addrRes.rows.length === 0) {
      await client.query(
        `INSERT INTO store_addresses (
          id, address, city, state, latitude, longitude, "isMain", "storeId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'Av. Principal de Las Mercedes, Edif. Centro, PB', 'Caracas', 'Distrito Capital', '10.48801', '-66.87919', true, $1, NOW(), NOW()
        )`,
        [bizStoreId]
      );
      console.log('   -> Store address created');
    } else {
      await client.query(
        `UPDATE store_addresses
         SET address = 'Av. Principal de Las Mercedes, Edif. Centro, PB', city = 'Caracas', state = 'Distrito Capital', latitude = '10.48801', longitude = '-66.87919', "isMain" = true, "updatedAt" = NOW()
         WHERE id = $1`,
        [addrRes.rows[0].id]
      );
      console.log('   -> Store address updated');
    }

    // 8. Store Payment Method
    console.log('8. Provisioning Store Payment Method (Pago Móvil)...');
    let bankRes = await client.query("SELECT id FROM banks WHERE code = '0102' OR name ILIKE '%Venezuela%' LIMIT 1");
    let bankId = bankRes.rows.length > 0 ? bankRes.rows[0].id : null;

    let spmRes = await client.query(
      'SELECT id FROM store_payment_methods WHERE "storeId" = $1 LIMIT 1',
      [bizStoreId]
    );

    if (spmRes.rows.length === 0) {
      await client.query(
        `INSERT INTO store_payment_methods (
          id, type, title, "accountHolder", "idNumber", "phoneNumber", "isActive", "storeId", "bankId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'PAGO_MOVIL', 'Pago Móvil Ferretería El Tornillo', 'Ferretería El Tornillo, C.A.', 'J409182341', '04145551234', true, $1, $2, NOW(), NOW()
        )`,
        [bizStoreId, bankId]
      );
      console.log('   -> Store payment method created (Pago Móvil)');
    } else {
      await client.query(
        `UPDATE store_payment_methods
         SET type = 'PAGO_MOVIL', title = 'Pago Móvil Ferretería El Tornillo', "accountHolder" = 'Ferretería El Tornillo, C.A.', "idNumber" = 'J409182341', "phoneNumber" = '04145551234', "isActive" = true, "bankId" = $1, "updatedAt" = NOW()
         WHERE id = $2`,
        [bankId, spmRes.rows[0].id]
      );
      console.log('   -> Store payment method updated');
    }

    // 9. Products with Verified 200 OK Image UUIDs
    console.log('9. Provisioning 4 Realistic Catalog Products with Verified Images...');
    await client.query('DELETE FROM items WHERE "storeId" = $1', [bizStoreId]);

    const products = [
      {
        title: 'Taladro Percutor Inalámbrico 20V Max',
        description: 'Taladro percutor de alto rendimiento con batería de litio 20V Max, selector de 2 velocidades, mandril metálico de ajuste rápido y luz LED frontal.',
        price: 48.00,
        mainImage: '/img/124470b1-4844-4f5f-9e05-520353835044',
        stock: 15
      },
      {
        title: 'Juego de Herramientas Mecánicas 48 Piezas',
        description: 'Maletín organizador de alta resistencia con rache profesional, dados de cromo vanadio, llaves combinadas, alicates y destornilladores.',
        price: 35.00,
        mainImage: '/img/7149c193-c39e-4595-b0ec-3223f81f1845',
        stock: 20
      },
      {
        title: 'Martillo de Uña Curva 16oz Mango Fibra',
        description: 'Martillo forjado en acero templado con cabeza pulida, uña curva para extracción precisa y mango ergonómico antideslizante amortiguador de golpes.',
        price: 9.50,
        mainImage: '/img/7bdbd4ec-bcbc-4b8d-921b-6006e753219d',
        stock: 30
      },
      {
        title: 'Cinta Métrica Profesional 5 Metros',
        description: 'Cinta métrica metálica de 5 metros con carcasa blindada, botón de freno automático, gancho magnético y graduación en milímetros y pulgadas.',
        price: 6.00,
        mainImage: '/img/1b0c9da8-2315-4be7-8c22-310cab3bb758',
        stock: 40
      }
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO items (
          id, title, description, price, "priceType", "mainImage", images, "storeId", "itemType", "trackInventory", "stockQuantity", "isActive", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 'FIXED', $4, ARRAY[$4], $5, 'PRODUCT', true, $6, true, NOW(), NOW()
        )`,
        [p.title, p.description, p.price, p.mainImage, bizStoreId, p.stock]
      );
      console.log(`   -> Created item: ${p.title} ($${p.price})`);
    }

    console.log('\n✅ Reviewer Accounts, Store and Products successfully provisioned:');
    console.log('   - Client:       demo.client@tulojita.com   / DemoReview2026! (Role: USER)');
    console.log('   - Business:     demo.business@tulojita.com / DemoReview2026! (Role: COMPANY)');
    console.log('   - Company:      Ferretería El Tornillo, C.A.');
    console.log('   - Subscription: ACTIVE (Valid until 2027-12-31)');
    console.log('   - Store:        Ferretería El Tornillo (ACTIVE, Address + Pago Móvil configured)');
    console.log('   - Products:     4 active items with real WebP images (200 OK) and available inventory');

  } catch (err) {
    console.error('❌ Error provisioning reviewer accounts:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
