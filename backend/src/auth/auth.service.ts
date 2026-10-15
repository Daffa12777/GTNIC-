import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { Request, Response } from 'express';

type Role = 'teknisi' | 'supervisor';
export interface User { username: string; role: Role }
interface Account extends User { hash: string }
interface Session { user: User; expires: number }
const derive = promisify(scrypt);
const COOKIE = 'mm_session';
const TTL = 8 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  readonly enabled = process.env.AUTH_ENABLED === 'true';
  private readonly accounts: Account[] = [];
  private readonly sessions = new Map<string, Session>();
  private readonly attempts = new Map<string, { count: number; expires: number }>();

  constructor() {
    if (!this.enabled) return;
    for (const [prefix, role] of [['TECHNICIAN', 'teknisi'], ['SUPERVISOR', 'supervisor']] as const) {
      const username = process.env[`AUTH_${prefix}_USERNAME`]?.trim();
      const hash = process.env[`AUTH_${prefix}_PASSWORD_HASH`]?.trim();
      if (!username || !hash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) throw new Error(`Konfigurasi akun ${prefix} tidak lengkap. Buat hash dengan scripts/hash-password.ps1.`);
      this.accounts.push({ username, hash, role });
    }
    if (this.accounts[0].username === this.accounts[1].username) throw new Error('Username teknisi dan supervisor harus berbeda.');
  }

  current(req: Request): User | null {
    const token = this.token(req);
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expires <= Date.now()) { this.sessions.delete(token); return null; }
    return session.user;
  }

  private token(req: Request): string {
    return req.headers.cookie?.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
  }

  async login(username: string, password: string, req: Request, res: Response): Promise<User> {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.expires <= now) this.attempts.delete(key);
    const key = req.ip ?? 'local';
    const attempt = this.attempts.get(key) ?? { count: 0, expires: now + 15 * 60 * 1000 };
    if (attempt.count >= 20 || this.attempts.size > 10000) throw new UnauthorizedException('Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
    attempt.count++; this.attempts.set(key, attempt);
    const account = this.accounts.find((a) => a.username === username);
    // Use the same expensive operation for unknown accounts to avoid username timing leaks.
    const [salt, hash] = (account?.hash ?? this.accounts[0]?.hash ?? '').split(':');
    if (!salt || !hash) throw new UnauthorizedException('Login tidak diaktifkan.');
    const actual = await derive(password, salt, 64) as Buffer;
    if (!account || !timingSafeEqual(actual, Buffer.from(hash, 'hex'))) throw new UnauthorizedException('Username atau kata sandi salah.');
    this.attempts.delete(key);
    for (const [token, session] of this.sessions) if (session.expires <= now) this.sessions.delete(token);
    if (this.sessions.size >= 1000) throw new UnauthorizedException('Sesi penuh. Coba lagi nanti.');
    this.sessions.delete(this.token(req));
    const token = randomBytes(32).toString('hex');
    const user: User = { username: account.username, role: account.role };
    this.sessions.set(token, { user, expires: now + TTL });
    res.cookie(COOKIE, token, { ...this.cookieOptions(), maxAge: TTL });
    return user;
  }

  logout(req: Request, res: Response) {
    this.sessions.delete(this.token(req));
    res.clearCookie(COOKIE, this.cookieOptions());
  }

  private cookieOptions() {
    return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.SESSION_COOKIE_SECURE === 'true', path: '/api' };
  }
}
