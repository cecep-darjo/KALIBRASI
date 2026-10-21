import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from '../lib/http.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-produksi';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/** Verifikasi Bearer token dan tempelkan payload ke req.user. */
export function authRequired(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('Token tidak ditemukan.'));
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    next(unauthorized('Token tidak valid atau sudah kedaluwarsa.'));
  }
}

/** Batasi akses berdasarkan peran. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`Aksi ini hanya untuk: ${roles.join(', ')}.`));
    }
    next();
  };
}
