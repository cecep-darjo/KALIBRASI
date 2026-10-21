import express from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../config/db.js';
import { signToken, authRequired } from '../middleware/auth.js';
import {
  asyncHandler, badRequest, unauthorized, conflict, notFound, assertEnum, nullable,
} from '../lib/http.js';

const router = express.Router();
const ROLES = ['Admin', 'Teknisi', 'SPV', 'Senior_SPV'];

/* POST /api/auth/login — login dengan username ATAU email */
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) throw badRequest('Username dan password wajib diisi.');

  const user = await queryOne(
    `SELECT id, username, email, password_hash, full_name, role, is_active
       FROM dbo.Users
      WHERE username = @id OR email = @id`,
    { id: String(username).trim() }
  );

  // Pesan error disamakan agar tidak membocorkan username mana yang valid.
  if (!user) throw unauthorized('Username atau password salah.');
  if (!user.is_active) throw unauthorized('Akun Anda tidak aktif.');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw unauthorized('Username atau password salah.');

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      created_at: user.created_at,
    },
  });
}));

/* POST /api/auth/register — pendaftaran mandiri (default peran: Teknisi) */
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, full_name, email, role } = req.body ?? {};
  if (!username || !password) throw badRequest('Username dan password wajib diisi.');
  if (String(password).length < 6) throw badRequest('Password minimal 6 karakter.');

  const finalRole = assertEnum(role ?? 'Teknisi', ROLES, 'Peran');

  const dupe = await queryOne('SELECT id FROM dbo.Users WHERE username = @username', {
    username: String(username).trim(),
  });
  if (dupe) throw conflict('Username sudah dipakai.');

  const hash = await bcrypt.hash(password, 10);
  const row = await queryOne(
    `INSERT INTO dbo.Users (username, email, password_hash, full_name, role)
     OUTPUT INSERTED.id, INSERTED.username, INSERTED.email,
            INSERTED.full_name, INSERTED.role, INSERTED.created_at
     VALUES (@username, @email, @hash, @full_name, @role)`,
    {
      username: String(username).trim(),
      email: nullable(email),
      hash,
      full_name: nullable(full_name),
      role: finalRole,
    }
  );

  res.status(201).json({ token: signToken(row), user: row });
}));

/* GET /api/auth/me — profil pengguna yang sedang login */
router.get('/me', authRequired, asyncHandler(async (req, res) => {
  const user = await queryOne(
    `SELECT id, username, email, full_name, role, created_at
       FROM dbo.Users WHERE id = @id`,
    { id: req.user.id }
  );
  if (!user) throw notFound('Pengguna tidak ditemukan.');
  res.json(user);
}));

/* PUT /api/auth/me — ubah nama/email sendiri */
router.put('/me', authRequired, asyncHandler(async (req, res) => {
  const { full_name, email } = req.body ?? {};
  const row = await queryOne(
    `UPDATE dbo.Users SET full_name = @full_name, email = @email, updated_at = SYSDATETIME()
     OUTPUT INSERTED.id, INSERTED.username, INSERTED.email,
            INSERTED.full_name, INSERTED.role, INSERTED.created_at
     WHERE id = @id`,
    { full_name: nullable(full_name), email: nullable(email), id: req.user.id }
  );
  if (!row) throw notFound('Pengguna tidak ditemukan.');
  res.json(row);
}));

/* POST /api/auth/change-password */
router.post('/change-password', authRequired, asyncHandler(async (req, res) => {
  const { old_password, new_password } = req.body ?? {};
  if (!old_password || !new_password) throw badRequest('Password lama dan baru wajib diisi.');
  if (String(new_password).length < 6) throw badRequest('Password baru minimal 6 karakter.');

  const user = await queryOne('SELECT password_hash FROM dbo.Users WHERE id = @id', { id: req.user.id });
  if (!user) throw notFound('Pengguna tidak ditemukan.');

  const ok = await bcrypt.compare(old_password, user.password_hash);
  if (!ok) throw unauthorized('Password lama salah.');

  await query(
    'UPDATE dbo.Users SET password_hash = @hash, updated_at = SYSDATETIME() WHERE id = @id',
    { hash: await bcrypt.hash(new_password, 10), id: req.user.id }
  );
  res.json({ ok: true });
}));

export default router;
