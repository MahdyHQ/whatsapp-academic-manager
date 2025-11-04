// Centralized configuration and environment validation for Whatsapp service
import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
export const AUTH_DIR = process.env.AUTH_DIR || '/tmp/auth_info';
export const API_KEY = process.env.API_KEY || null;
export const AUTHORIZED_PHONES = process.env.AUTHORIZED_PHONES
  ? new Set(process.env.AUTHORIZED_PHONES.split(',').map(p => p.trim()))
  : new Set(['+201155547529']);

export const PHONE_LIMIT = Number(process.env.OTP_PHONE_LIMIT || 3);
export const PHONE_WINDOW_MS = Number(process.env.OTP_PHONE_WINDOW_MS || 10 * 60 * 1000);
export const IP_LIMIT = Number(process.env.OTP_IP_LIMIT || 30);
export const IP_WINDOW_MS = Number(process.env.OTP_IP_WINDOW_MS || 60 * 60 * 1000);

export const MAX_RECONNECT_ATTEMPTS = Number(process.env.MAX_RECONNECT_ATTEMPTS || 10);

// Validate environment and return an array of warnings (empty if OK)
export function validateEnv(logger = console) {
  const warnings = [];

  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV is not set; defaulting to development');
  }

  if (!process.env.API_KEY) {
    warnings.push('API_KEY is not set - admin endpoints will be unprotected unless configured');
  }

  if (!process.env.AUTHORIZED_PHONES) {
    warnings.push('AUTHORIZED_PHONES not provided; using default test number. Add your authorized phones via AUTHORIZED_PHONES env var (comma-separated)');
  }

  if (Number.isNaN(PORT) || PORT <= 0) {
    warnings.push(`PORT value is invalid: ${process.env.PORT}`);
  }

  // Log warnings if a logger is passed
  if (warnings.length && logger && typeof logger.warn === 'function') {
    warnings.forEach(w => logger.warn('Config warning:', w));
  }

  return warnings;
}
