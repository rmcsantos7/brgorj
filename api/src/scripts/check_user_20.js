require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const db = require('../config/database');

(async () => {
  try {
    const u = await db.query(`
      SELECT usr_codigo, usr_login, usr_nome,
             usr_email,
             usr_celular,
             length(usr_celular) AS len_cel,
             regexp_replace(usr_celular, '\\D', '', 'g') AS so_digitos
      FROM fr_usuario
      WHERE usr_codigo = 20
    `);
    console.log('USUARIO 20:', JSON.stringify(u.rows, null, 2));
  } catch (e) {
    console.log('ERR:', e.message);
  }
  process.exit(0);
})();
