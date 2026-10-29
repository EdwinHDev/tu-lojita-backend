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

    console.log('3. Provisioning Company for Business Reviewer...');
    const compLogo = '/img/5187dd95-dc5a-45d8-8062-810280a174fb';
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

    console.log('4. Finding Ferretería Subcategory...');
    let subcatRes = await client.query(
      "SELECT id FROM subcategories WHERE name ILIKE '%Ferreter%' LIMIT 1"
    );
    let subcatId = subcatRes.rows.length > 0 ? subcatRes.rows[0].id : null;

    if (!subcatId) {
      console.log('   -> Subcategory Ferretería not found, finding any subcategory...');
      let anySub = await client.query('SELECT id FROM subcategories LIMIT 1');
      subcatId = anySub.rows.length > 0 ? anySub.rows[0].id : null;
    }
    console.log('   -> Using Subcategory ID:', subcatId);

    console.log('5. Provisioning Store for Business Reviewer...');
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

    console.log('6. Provisioning 4 Realistic Catalog Products for Store...');
    // Clean old demo items for this store
    await client.query('DELETE FROM items WHERE "storeId" = $1', [bizStoreId]);

    const products = [
      {
        title: 'Taladro Percutor Inalámbrico 20V',
        description: 'Taladro percutor de alto rendimiento con batería de litio 20V Max, selector de 2 velocidades, mandril metálico de ajuste rápido y luz LED frontal.',
        price: 48.00,
        mainImage: '/img/fd5accbe-db6d-4d69-98a0-f8048d0627fa',
        stock: 15
      },
      {
        title: 'Juego de Herramientas Mecánicas 48 Piezas',
        description: 'Maletín organizador de alta resistencia con rache profesional, dados de cromo vanadio, llaves combinadas, alicates y destornilladores.',
        price: 35.00,
        mainImage: '/img/977bc357-908a-47cf-baaa-527b5196b376',
        stock: 20
      },
      {
        title: 'Martillo de Uña Curva 16oz Mango Fibra',
        description: 'Martillo forjado en acero templado con cabeza pulida, uña curva para extracción precisa y mango ergonómico antideslizante amortiguador de golpes.',
        price: 9.50,
        mainImage: '/img/148e8ed6-119d-47c2-82ee-44f4fcd63950',
        stock: 30
      },
      {
        title: 'Cinta Métrica Profesional 5 Metros',
        description: 'Cinta métrica metálica de 5 metros con carcasa blindada, botón de freno automático, gancho magnético y graduación en milímetros y pulgadas.',
        price: 6.00,
        mainImage: '/img/b38bcad1-d3d3-4791-8639-328e6e4796b1',
        stock: 40
      }
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO items (
          id, title, description, price, "priceType", "mainImage", images, "storeId", "itemType", "trackInventory", "stockQuantity", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 'FIXED', $4, ARRAY[$4], $5, 'PRODUCT', true, $6, NOW(), NOW()
        )`,
        [p.title, p.description, p.price, p.mainImage, bizStoreId, p.stock]
      );
      console.log(`   -> Created item: ${p.title} ($${p.price})`);
    }

    console.log('\n✅ Reviewer Hardware Store successfully provisioned:');
    console.log('   - Client:   demo.client@tulojita.com   / DemoReview2026! (Carlos Mendoza)');
    console.log('   - Business: demo.business@tulojita.com / DemoReview2026! (Ferretería El Tornillo)');
    console.log('   - Company:  Ferretería El Tornillo, C.A.');
    console.log('   - Store:    Ferretería El Tornillo (4 productos activos con stock y fotos)');

  } catch (err) {
    console.error('❌ Error provisioning reviewer accounts:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
