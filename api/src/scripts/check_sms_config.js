require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const db = require('../config/database');

(async () => {
  try {
    const r = await db.query(`
      SELECT crd_dad_id,
             crd_dad_host             AS host,
             CASE WHEN crd_dad_senha IS NULL OR crd_dad_senha = ''
                  THEN 'MISSING' ELSE 'OK (' || length(crd_dad_senha) || ' chars)' END AS token,
             crd_dad_tipo_comunicacao AS servico,
             crd_dad_usuario          AS parceiro_id
      FROM crd_dados_sensiveis
      WHERE crd_dad_id = 2
    `);
    console.log('SMS CONFIG (pk=2):', JSON.stringify(r.rows, null, 2));

    const u = await db.query(`
      SELECT usr_codigo, usr_login, usr_nome,
             usr_celular,
             CASE WHEN usr_celular IS NULL OR usr_celular = '' THEN 'MISSING'
                  ELSE 'OK' END AS status_celular
      FROM fr_usuario
      WHERE usr_codigo = 14
    `);
    console.log('USUARIO 14:', JSON.stringify(u.rows, null, 2));
  } catch (e) {
    console.log('ERR:', e.message);
  }
  process.exit(0);
})();
