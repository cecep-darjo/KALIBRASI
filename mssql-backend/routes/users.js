import express from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  asyncHandler, badRequest, conflict, notFound, intParam, assertEnum, nullable,
} from '../lib/http.js';

const router = express.Router();
const ROLES = ['Admin', 'Teknisi', 'SPV', 'Senior_SPV'];

const SELECT_FIELDS = 'id, username, email, full_name, role, is_active, created_at, updated_at';

/* GET /api/users?role=Teknisi — daftar pengguna */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const role = req.query.role;
  if (role) assertEnum(role, ROLES, 'Peran');
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM dbo.Users
     ${role ? 'WHERE role = @role' : ''}
     ORDER BY ISNULL(full_name, username)`,
    role ? { role } : undefined
  );
  res.json(rows);
}));

/* GET /api/users/technicians — khusus teknisi (dipakai form penugasan) */
router.get('/technicians', authRequired, asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM dbo.Users
      WHERE role = N'Teknisi' AND is_active = 1
      ORDER BY ISNULL(full_name, username)`
  );
  res.json(rows);
}));

/* GET /api/users/:id */
router.get('/:id', authRequired, asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT ${SELECT_FIELDS} FROM dbo.Users WHERE id = @id`,
    { id: intParam(req.params.id) }
  );
  if (!row) throw notFound('Pengguna tidak ditemukan.');
  res.json(row);
}));

/* POST /api/users — buat pengguna (Admin) */
router.post('/', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const { username, password, full_name, email, role } = req.body ?? {};
  if (!username || !password) throw badRequest('Username dan password wajib diisi.');
  if (String(password).length < 6) throw badRequest('Password minimal 6 karakter.');
  const finalRole = assertEnum(role ?? 'Teknisi', ROLES, 'Peran');

  const dupe = await queryOne('SELECT id FROM dbo.Users WHERE username = @username', {
    username: String(username).trim(),
  });
  if (dupe) throw conflict('Username sudah dipakai.');

  const row = await queryOne(
    `INSERT INTO dbo.Users (username, email, password_hash, full_name, role)
     OUTPUT INSERTED.id, INSERTED.username, INSERTED.email,
            INSERTED.full_name, INSERTED.role, INSERTED.is_active, INSERTED.created_at
     VALUES (@username, @email, @hash, @full_name, @role)`,
    {
      username: String(username).trim(),
      email: nullable(email),
      hash: await bcrypt.hash(password, 10),
      full_name: nullable(full_name),
      role: finalRole,
    }
  );
  res.status(201).json(row);
}));

/* PUT /api/users/:id — ubah data pengguna (Admin) */
router.put('/:id', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { full_name, email, role, is_active } = req.body ?? {};

  if (role !== undefined) assertEnum(role, ROLES, 'Peran');

  // Cegah admin menurunkan peran dirinya sendiri dan kehilangan akses.
  if (id === req.user.id && role !== undefined && role !== 'Admin') {
    throw badRequest('Anda tidak dapat mengubah peran akun Anda sendiri.');
  }

  const row = await queryOne(
    `UPDATE dbo.Users
        SET full_name = COALESCE(@full_name, full_name),
            email     = @email,
            role      = COALESCE(@role, role),
            is_active = COALESCE(@is_active, is_active),
            updated_at = SYSDATETIME()
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.email,
             INSERTED.full_name, INSERTED.role, INSERTED.is_active, INSERTED.created_at
      WHERE id = @id`,
    {
      full_name: nullable(full_name),
      email: nullable(email),
      role: role ?? null,
      is_active: is_active === undefined ? null : (is_active ? 1 : 0),
      id,
    }
  );
  if (!row) throw notFound('Pengguna tidak ditemukan.');
  res.json(row);
}));

/* PUT /api/users/:id/role — ubah peran saja (dipakai halaman Manajemen User) */
router.put('/:id/role', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const role = assertEnum(req.body?.role, ROLES, 'Peran');

  if (id === req.user.id && role !== 'Admin') {
    throw badRequest('Anda tidak dapat mengubah peran akun Anda sendiri.');
  }

  const row = await queryOne(
    `UPDATE dbo.Users SET role = @role, updated_at = SYSDATETIME()
     OUTPUT INSERTED.id, INSERTED.username, INSERTED.email,
            INSERTED.full_name, INSERTED.role, INSERTED.is_active, INSERTED.created_at
     WHERE id = @id`,
    { role, id }
  );
  if (!row) throw notFound('Pengguna tidak ditemukan.');
  res.json(row);
}));

/* PUT /api/users/:id/password — reset password oleh Admin */
router.put('/:id/password', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { password } = req.body ?? {};
  if (!password || String(password).length < 6) throw badRequest('Password minimal 6 karakter.');

  await query(
    'UPDATE dbo.Users SET password_hash = @hash, updated_at = SYSDATETIME() WHERE id = @id',
    { hash: await bcrypt.hash(password, 10), id }
  );
  const exists = await queryOne('SELECT id FROM dbo.Users WHERE id = @id', { id });
  if (!exists) throw notFound('Pengguna tidak ditemukan.');
  res.json({ ok: true });
}));

/* DELETE /api/users/:id (Admin) */
router.delete('/:id', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (id === req.user.id) throw badRequest('Anda tidak dapat menghapus akun Anda sendiri.');

  const used = await queryOne(
    'SELECT TOP 1 id FROM dbo.Calibration_Tasks WHERE technician_id = @id',
    { id }
  );
  if (used) {
    throw conflict('Teknisi ini masih memiliki tugas kalibrasi. Nonaktifkan akunnya sebagai gantinya.');
  }

  const rows = await query('DELETE FROM dbo.Users OUTPUT DELETED.id WHERE id = @id', { id });
  if (rows.length === 0) throw notFound('Pengguna tidak ditemukan.');
  res.json({ ok: true });
}));

export default router;
