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

  console.log('=== ALL INSTALLMENTS IN DB ===');
  const res = await client.query(`
    SELECT 
      i.id, 
      i.amount, 
      i."paidAmount", 
      i."lateFeeApplied", 
      i."dueDate", 
      i.status,
      i."orderId",
      o.status as order_status,
      o."storeId",
      u.email as user_email
    FROM installments i
    JOIN orders o ON i."orderId" = o.id
    JOIN users u ON o."userId" = u.id
    ORDER BY i."dueDate" ASC;
  `);

  console.table(res.rows);

  console.log('\n=== ALL PAYMENTS IN DB ===');
  const resPay = await client.query(`
    SELECT 
      p.id,
      p.amount,
      p.status,
      p."createdAt",
      p."orderId"
    FROM payments p
    ORDER BY p."createdAt" DESC;
  `);
  console.table(resPay.rows);

  await client.end();
}

main().catch(err => console.error(err));
