const path = require('path');
const pg = require(path.join(__dirname, 'node_modules', 'pg'));

async function main() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '289932918276521235064',
    database: 'tu-lojita',
  });

  await client.connect();

  console.log('Fixing installments for FULLY_PAID orders...');
  const res = await client.query(`
    UPDATE installments
    SET status = 'PAID', "paidAmount" = amount
    WHERE "orderId" IN (
      SELECT id FROM orders WHERE status = 'FULLY_PAID'
    )
    AND status != 'PAID';
  `);

  console.log(`Updated ${res.rowCount} installment rows to PAID.`);
  await client.end();
}

main().catch(err => console.error(err));
