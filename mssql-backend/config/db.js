import sql from 'mssql';
import 'dotenv/config';

/*
  Dua mode koneksi yang didukung:

  1. SQL Server Authentication (driver "tedious", bawaan paket mssql)
     Set MSSQL_CONNECTION_STRING, contoh:
       Server=10.14.1.81\\SQLTESTO;Database=DbKalibrasi;User Id=sa;Password=rahasia;Encrypt=false;TrustServerCertificate=true

  2. Windows Authentication (driver "msnodesqlv8")
     Set MSSQL_TRUSTED=true. Perlu paket tambahan:
       npm install msnodesqlv8
     Untuk driver ini, opsi restricted/trusted hanya berlaku di Windows.
*/

const useTrusted =
  String(process.env.MSSQL_TRUSTED ?? '').toLowerCase() === 'true';

let config;

if (useTrusted) {
  config = {
    server: process.env.MSSQL_SERVER || 'localhost',
    database: process.env.MSSQL_DATABASE || 'DbKalibrasi',
    driver: 'msnodesqlv8',
    options: {
      trustedConnection: true,
      trustServerCertificate: true,
      encrypt: false,
      instanceName: process.env.MSSQL_INSTANCE || undefined,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
} else if (process.env.MSSQL_CONNECTION_STRING) {
  // Syntax: mssql://user:pass@host:port/database  ATAU  ADO style
  // "Server=...;Database=...;User Id=...;Password=...;"
  config = process.env.MSSQL_CONNECTION_STRING;
} else {
  config = {
    server: process.env.MSSQL_SERVER || 'localhost',
    port: Number(process.env.MSSQL_PORT || 1433),
    database: process.env.MSSQL_DATABASE || 'DbKalibrasi',
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || '',
    options: {
      trustServerCertificate: true,
      encrypt: false,
      instanceName: process.env.MSSQL_INSTANCE || undefined,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

let pool;

export async function getPool() {
  if (pool && pool.connected) return pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    const mode = useTrusted ? 'Windows Authentication' : 'SQL Authentication';
    console.log(`[db] Tersambung ke SQL Server (${mode}).`);
    pool.on('error', (err) => console.error('[db] Pool error:', err.message));
    return pool;
  } catch (err) {
    pool = undefined;
    console.error('[db] Gagal tersambung ke SQL Server:', err.message);
    throw err;
  }
}

/** Jalankan query dan kembalikan array baris. */
export async function query(text, params) {
  const p = await getPool();
  const request = p.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value === undefined ? null : value);
    }
  }
  const result = await request.query(text);
  return result.recordset ?? [];
}

/** Jalankan query dan kembalikan baris pertama (atau undefined). */
export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0];
}

/**
 * Jalankan beberapa statement dalam satu transaksi.
 * Callback menerima objek transaction; gunakan trx.request() untuk query.
 */
export async function withTransaction(fn) {
  const p = await getPool();
  const trx = new sql.Transaction(p);
  await trx.begin();
  try {
    const result = await fn(trx);
    await trx.commit();
    return result;
  } catch (err) {
    try { await trx.rollback(); } catch { /* sudah rollback */ }
    throw err;
  }
}

/** Helper: buat request dengan parameter dari objek. */
export function requestWith(trxOrPool, params) {
  const request = trxOrPool.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value === undefined ? null : value);
    }
  }
  return request;
}

export async function closePool() {
  if (pool) {
    await pool.close();
    pool = undefined;
  }
}

export { sql };
