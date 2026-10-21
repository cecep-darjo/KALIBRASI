import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { getPool, closePool, sql } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import equipmentRoutes from './routes/equipment.js';
import taskRoutes from './routes/tasks.js';
import resultRoutes from './routes/results.js';
import approvalRoutes from './routes/approvals.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

/* ---------- Health check ---------- */
app.get('/api/health', async (_req, res) => {
  try {
    const rows = await getPool().then((p) => p.request().query('SELECT 1 AS ok'));
    res.json({ ok: true, database: rows.recordset?.[0]?.ok === 1 ? 'connected' : 'unknown' });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

/* ---------- Routes ---------- */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

/* ---------- Error handler ---------- */
app.use((err, _req, res, _next) => {
  const status = err.status || 500;

  if (status >= 500) {
    console.error('[error]', err);
  }

  // Terjemahkan error khas SQL Server menjadi pesan yang ramah pengguna.
  let message = err.message || 'Terjadi kesalahan pada server.';
  if (err.number === 2627 || err.number === 2601 || err.code === 'EREQUEST'
      && /duplicate key|UNIQUE KEY/i.test(message)) {
    message = 'Data dengan nilai unik tersebut sudah ada.';
  } else if (err.number === 547) {
    message = 'Operasi ditolak karena data ini masih berelasi dengan data lain.';
  } else if (err.number === 2628) {
    message = 'Teks yang dimasukkan melebihi panjang kolom yang diizinkan.';
  } else if (err.code === 'ESOCKET' || err.code === 'ELOGIN') {
    message = 'Gagal terhubung ke basis data. Periksa konfigurasi koneksi.';
  }

  res.status(status).json({ error: message });
});

/* ---------- Startup ---------- */
const server = app.listen(PORT, () => {
  console.log(`[server] KalibrasiMS API berjalan di http://localhost:${PORT}`);
});

/* Verifikasi koneksi database saat start (tanpa menggagalkan server bila down). */
getPool()
  .then(() => console.log('[server] Koneksi database siap.'))
  .catch((err) => {
    console.warn('[server] Peringatan: database belum dapat dihubungi.');
    console.warn(`[server] ${err.message}`);
    console.warn('[server] Periksa file .env lalu jalankan ulang server.');
  });

/* ---------- Graceful shutdown ---------- */
async function shutdown(signal) {
  console.log(`\n[server] Menerima ${signal}, menutup...`);
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
  // Paksa keluar bila koneksi menggantung lebih dari 10 detik.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app, sql };
