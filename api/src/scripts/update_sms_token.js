require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const db = require('../config/database');

const NOVO_TOKEN = 'f8224bd9911871192c5b3a842943d3d3e58d66dc';

(async () => {
  try {
    const antes = await db.query(`
      SELECT crd_dad_senha AS token FROM crd_dados_sensiveis WHERE crd_dad_id = 2
    `);
    console.log('Antes:', antes.rows[0]?.token);

    const r = await db.query(
      `UPDATE crd_dados_sensiveis SET crd_dad_senha = $1 WHERE crd_dad_id = 2 RETURNING crd_dad_senha AS token`,
      [NOVO_TOKEN]
    );
    console.log('Depois:', r.rows[0]?.token);
    console.log('Rows afetadas:', r.rowCount);
  } catch (e) {
    console.log('ERR:', e.message);
  }
  process.exit(0);
})();
