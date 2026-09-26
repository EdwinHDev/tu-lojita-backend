const path = require('path');
try {
  require(path.join(__dirname, 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '.env') });
} catch (_) {}
const pg = require(path.join(__dirname, 'node_modules', 'pg'));
const bcrypt = require(path.join(__dirname, 'node_modules', 'bcrypt'));

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '289932918276521235064',
    database: process.env.DB_NAME || 'tu_lojita_backend',
  });

  console.log('Connecting to PostgreSQL database for reviewer seed...');
  await client.connect();

  try {
    const rawPassword = 'DemoReview2026!';
    const hashedPassword = bcrypt.hashSync(rawPassword, 10);

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
          gen_random_uuid(), 'Cliente', 'Demo', 'demo.client@tulojita.com', $1, true, true, 'USER', NOW(), NOW()
        ) RETURNING id`,
        [hashedPassword]
      );
      clientUserId = insertClient.rows[0].id;
      console.log('   -> Client demo account created with ID:', clientUserId);
    } else {
      clientUserId = clientRes.rows[0].id;
      await client.query(
        `UPDATE users 
         SET password = $1, "isActive" = true, confirm = true, role = 'USER', "updatedAt" = NOW()
         WHERE id = $2`,
        [hashedPassword, clientUserId]
      );
      console.log('   -> Client demo account updated with ID:', clientUserId);
    }

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
          gen_random_uuid(), 'Empresa', 'Demo', 'demo.business@tulojita.com', $1, true, true, 'COMPANY', NOW(), NOW()
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
         SET password = $1, "isActive" = true, confirm = true, role = 'COMPANY', "updatedAt" = NOW()
         WHERE id = $2`,
        [hashedPassword, bizUserId]
      );
      console.log('   -> Business demo account updated with ID:', bizUserId);
    }

    console.log('3. Provisioning Company for Business Reviewer...');
    if (!bizCompanyId) {
      let compRes = await client.query(
        'SELECT id FROM companies WHERE "ownerId" = $1 OR name = $2 LIMIT 1',
        [bizUserId, 'Empresa Demo Google Review']
      );

      if (compRes.rows.length === 0) {
        const insertComp = await client.query(
          `INSERT INTO companies (
            id, name, rif, logo, "ownerId", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), 'Empresa Demo Google Review', 'J-50000000-1', 'https://images.tulojita.com/default-logo.png', $1, NOW(), NOW()
          ) RETURNING id`,
          [bizUserId]
        );
        bizCompanyId = insertComp.rows[0].id;
        console.log('   -> Demo Company created with ID:', bizCompanyId);
      } else {
        bizCompanyId = compRes.rows[0].id;
        console.log('   -> Existing Demo Company found with ID:', bizCompanyId);
      }

      await client.query(
        'UPDATE users SET "companyId" = $1 WHERE id = $2',
        [bizCompanyId, bizUserId]
      );
    }

    console.log('4. Provisioning Store for Business Reviewer...');
    if (!bizStoreId) {
      let storeRes = await client.query(
        'SELECT id FROM stores WHERE "companyId" = $1 OR "ownerId" = $2 LIMIT 1',
        [bizCompanyId, bizUserId]
      );

      if (storeRes.rows.length === 0) {
        let subcatRes = await client.query('SELECT id FROM subcategories LIMIT 1');
        let subcatId = subcatRes.rows.length > 0 ? subcatRes.rows[0].id : null;

        if (!subcatId) {
          console.warn('   -> No subcategory found, creating a default one...');
          let catRes = await client.query('SELECT id FROM categories LIMIT 1');
          let catId = catRes.rows.length > 0 ? catRes.rows[0].id : null;
          if (!catId) {
            const insCat = await client.query(
              "INSERT INTO categories (id, name, icon, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'General', 'store', NOW(), NOW()) RETURNING id"
            );
            catId = insCat.rows[0].id;
          }
          const insSub = await client.query(
            "INSERT INTO subcategories (id, name, \"categoryId\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'General', $1, NOW(), NOW()) RETURNING id",
            [catId]
          );
          subcatId = insSub.rows[0].id;
        }

        const insertStore = await client.query(
          `INSERT INTO stores (
            id, name, slug, description, rif, phone, logo, "companyId", "ownerId", "subcategoryId", status, "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), 'Tienda Demo Google Review', 'tienda-demo-google-review', 
            'Tienda de demostración para revisión de Google Play Store', 'J-50000000-1', 
            '+584120000000', 'https://images.tulojita.com/default-logo.png', 
            $1, $2, $3, 'ACTIVE', NOW(), NOW()
          ) RETURNING id`,
          [bizCompanyId, bizUserId, subcatId]
        );
        bizStoreId = insertStore.rows[0].id;
        console.log('   -> Demo Store created with ID:', bizStoreId);
      } else {
        bizStoreId = storeRes.rows[0].id;
        console.log('   -> Existing Demo Store found with ID:', bizStoreId);
      }

      await client.query(
        'UPDATE users SET "storeId" = $1 WHERE id = $2',
        [bizStoreId, bizUserId]
      );
    }

    console.log('5. Provisioning Sample Product for Store...');
    const itemRes = await client.query(
      'SELECT id FROM items WHERE "storeId" = $1 LIMIT 1',
      [bizStoreId]
    );

    if (itemRes.rows.length === 0) {
      await client.query(
        `INSERT INTO items (
          id, title, description, price, "priceType", "mainImage", images, "storeId", "itemType", "trackInventory", "stockQuantity", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'Producto Demo Google Review', 
          'Producto de muestra verificado para la revisión en Google Play Console.', 
          15.00, 'FIXED', 'https://images.tulojita.com/default-logo.png', 
          ARRAY['https://images.tulojita.com/default-logo.png'], 
          $1, 'PRODUCT', true, 100, NOW(), NOW()
        )`,
        [bizStoreId]
      );
      console.log('   -> Sample demo product created.');
    } else {
      console.log('   -> Store already has products.');
    }

    console.log('\n✅ Reviewer Demo accounts successfully provisioned:');
    console.log('   - Client:   demo.client@tulojita.com   / DemoReview2026! (Role: USER)');
    console.log('   - Business: demo.business@tulojita.com / DemoReview2026! (Role: COMPANY, Active Store & Product)');

  } catch (err) {
    console.error('❌ Error provisioning reviewer accounts:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
