require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const db = require('../config/database');

(async () => {
  try {
    const r = await db.query(`
      SELECT crd_dad_id,
             crd_dad_host             AS host,
             crd_dad_senha            AS token,
             length(crd_dad_senha)    AS token_len,
             crd_dad_tipo_comunicacao AS servico,
             crd_dad_usuario          AS parceiro_id
      FROM crd_dados_sensiveis
      WHERE crd_dad_id = 2
    `);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.log('ERR:', e.message);
  }
  process.exit(0);
})();
