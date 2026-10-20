import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: '10.14.1.81\\SQLTESTO',
  database: 'DbKalibrasi',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
    encrypt: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool;

export async function getPool() {
  if (!pool || !pool.connected) {
    pool = await sql.connect(config);
    console.log('[db] Berjaya disambungkan ke Microsoft SQL Server menggunakan Windows Authentication');
  }
  return pool;
}

export async function query(text, params) {
  const p = await getPool();
  const request = p.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }
  const result = await request.query(text);
  return result.recordset;
}

export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0];
}

export { sql };