/** Bungkus handler async agar error otomatis diteruskan ke error middleware. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** Error HTTP dengan status code. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const notFound = (msg = 'Data tidak ditemukan') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Ambil integer dari parameter rute; lempar 400 bila tidak valid. */
export function intParam(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Parameter ${name} tidak valid.`);
  return n;
}

/** Buang field yang undefined, ubah string kosong menjadi null. */
export function nullable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

/** Validasi nilai terhadap daftar enum. */
export function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw badRequest(`${field} harus salah satu dari: ${allowed.join(', ')}.`);
  }
  return value;
}
