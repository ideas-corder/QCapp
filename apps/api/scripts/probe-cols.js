const { Client } = require('pg');
const c = new Client({
  host: 'localhost',
  user: 'qc',
  password: 'qc_password_change_me',
  database: 'qc_inspector',
});
c.connect()
  .then(async () => {
    const r = await c.query(
      "SELECT inspection_number, COUNT(*) AS n FROM inspections GROUP BY inspection_number ORDER BY inspection_number LIMIT 10",
    );
    console.log('--- inspection_number sample ---');
    console.log(JSON.stringify(r.rows, null, 2));
    const distinct = await c.query(
      "SELECT COUNT(DISTINCT inspection_number) AS distinct_numbers, COUNT(*) AS total FROM inspections",
    );
    console.log('--- distinct/total ---');
    console.log(JSON.stringify(distinct.rows, null, 2));
    await c.end();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
