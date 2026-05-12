require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const db = require('../config/database');

(async () => {
  try {
    const r1 = await db.query(`
      SELECT r.crd_usucrerem_id, r.crd_cli_id, r.crd_rem_status, r.crd_rem_data_criacao,
             r.crd_rem_motivo_cancelamento, r.crd_rem_cancelado_por, r.crd_rem_data_cancelamento
      FROM crd_usuario_credito_remessa r
      WHERE r.crd_usucrerem_id = 79
    `);
    console.log('REMESSA:', JSON.stringify(r1.rows, null, 2));
  } catch (e) {
    console.log('REMESSA err:', e.message);
    try {
      const r1b = await db.query(`SELECT * FROM crd_usuario_credito_remessa WHERE crd_usucrerem_id = 79`);
      console.log('REMESSA (full):', JSON.stringify(r1b.rows, null, 2));
    } catch (e2) { console.log(e2.message); }
  }

  try {
    const r2 = await db.query(`
      SELECT nf.* FROM crd_nota_fiscal nf
      INNER JOIN crd_usuario_credito c ON c.crd_not_id = nf.crd_not_id
      WHERE c.crd_usucrerem_id = 79
      GROUP BY nf.crd_not_id
    `);
    console.log('NOTA:', JSON.stringify(r2.rows, null, 2));
  } catch (e) { console.log('NOTA err:', e.message); }

  try {
    const r3 = await db.query(`SELECT * FROM crd_usuario_credito WHERE crd_usucrerem_id = 79`);
    console.log('CREDITOS:', JSON.stringify(r3.rows, null, 2));
  } catch (e) { console.log('CREDITOS err:', e.message); }

  process.exit(0);
})();
