import { BadRequestException, ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { Request, Response } from 'express';
import { DbService } from '../db/db.service';
import { CONFIG } from '../config';
import type { ChangePasswordDto, UpdateProfileDto } from './profile.dto';

export type Role = 'teknisi' | 'supervisor' | 'owner';
export const canSupervise = (role?: string): boolean => role === 'owner' || role === 'supervisor';
export interface User { username: string; role: Role; name?: string | null }
interface AccessClaims { sub: string; sid: string; typ: 'access' }
const derive = promisify(scrypt);
const ACCESS = 'mm_access';
const REFRESH = 'mm_refresh';
const ACCESS_SECONDS = 15 * 60;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService implements OnModuleInit {
  readonly enabled = process.env.AUTH_ENABLED !== 'false';
  private readonly attempts = new Map<string, { count: number; expires: number }>();
  private readonly jwt = new JwtService();
  constructor(private readonly db: DbService) {
    if (this.enabled && (process.env.JWT_SECRET?.length ?? 0) < 32) throw new Error('JWT_SECRET wajib acak dan minimal 32 karakter saat AUTH_ENABLED=true.');
    if (this.enabled && process.env.AUTH_TECHNICIAN_USERNAME && process.env.AUTH_TECHNICIAN_USERNAME === process.env.AUTH_SUPERVISOR_USERNAME) throw new Error('Username teknisi dan supervisor harus berbeda.');
  }
  async onModuleInit() {
    if (!this.enabled) return;
    await this.db.transaction(async () => {
      await this.db.q("SELECT pg_advisory_xact_lock(hashtext('manualmechanic-user-bootstrap'))::text");
      // Bootstrap only an empty installation. Existing database accounts are authoritative.
      if (await this.db.client.user.count()) return;
      for (const [prefix, role] of [['TECHNICIAN', 'teknisi'], ['SUPERVISOR', 'supervisor']] as const) {
        const username = process.env[`AUTH_${prefix}_USERNAME`]?.trim();
        const passwordHash = process.env[`AUTH_${prefix}_PASSWORD_HASH`]?.trim();
        if (!username || !passwordHash) continue;
        if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) throw new Error(`Hash akun ${prefix} tidak valid.`);
        await this.db.client.user.create({ data: { username, passwordHash, role } });
      }
      if (await this.db.client.user.count({ where: { active: true } }) === 0) throw new Error('Belum ada akun. Isi hash bootstrap AUTH_TECHNICIAN_PASSWORD_HASH dan AUTH_SUPERVISOR_PASSWORD_HASH.');
    });
  }
  async current(req: Request): Promise<User | null> {
    const session = await this.activeSession(req);
    return session ? this.publicUser(session.user) : null;
  }
  private valid(session: { expiresAt: Date; createdAt: Date; revokedAt: Date | null; user: { active: boolean } }): boolean {
    const time = Date.now(), absolute = session.createdAt.getTime() + SESSION_MAX_MS;
    return !session.revokedAt && session.user.active && session.expiresAt.getTime() > time && absolute > time && session.expiresAt.getTime() <= absolute;
  }
  private async activeSession(req: Request) {
    const claims = await this.claims(req);
    if (!claims) return null;
    const session = await this.db.client.refreshSession.findFirst({ where: { id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() }, user: { active: true } }, include: { user: true } });
    return session && this.valid(session) ? session : null;
  }
  async sessionInfo(req: Request) {
    const session = await this.activeSession(req);
    return { enabled: this.enabled, user: session ? this.publicUser(session.user) : null, ...(session ? { expiresAt: session.expiresAt.getTime(), absoluteExpiresAt: session.createdAt.getTime() + SESSION_MAX_MS } : {}) };
  }
  async activity(req: Request) {
    const claims = await this.claims(req);
    if (!claims || !this.enabled) throw new UnauthorizedException('Sesi berakhir. Silakan masuk kembali.');
    return this.db.transaction(async () => {
      await this.db.q('SELECT id FROM refresh_sessions WHERE id=$1 FOR UPDATE', [claims.sid]);
      const session = await this.db.client.refreshSession.findUnique({ where: { id: claims.sid }, include: { user: true } });
      if (!session || session.userId !== claims.sub || !this.valid(session)) throw new UnauthorizedException('Sesi berakhir. Silakan masuk kembali.');
      const absoluteExpiresAt = session.createdAt.getTime() + SESSION_MAX_MS;
      const expiresAt = Math.min(Date.now() + SESSION_IDLE_MS, absoluteExpiresAt);
      await this.db.client.refreshSession.update({ where: { id: session.id }, data: { expiresAt: new Date(expiresAt) } });
      return { expiresAt, absoluteExpiresAt };
    });
  }
  private async claims(req: Request): Promise<AccessClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(this.cookie(req, ACCESS), { secret: process.env.JWT_SECRET, algorithms: ['HS256'], issuer: 'manualmechanic', audience: 'manualmechanic-web' });
      return claims.typ === 'access' && typeof claims.sub === 'string' && typeof claims.sid === 'string' ? claims : null;
    } catch { return null; }
  }
  private cookie(req: Request, name: string): string { return req.headers.cookie?.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''; }
  private publicUser(user: { username: string; role: string; name?: string | null }): User {
    if (user.role !== 'teknisi' && user.role !== 'supervisor' && user.role !== 'owner') throw new UnauthorizedException('Peran akun tidak valid.');
    return { username: user.username, role: user.role, ...(user.name ? { name: user.name } : {}) };
  }
  private async account(req: Request) {
    const claims = await this.claims(req);
    if (!this.enabled || !claims || !await this.current(req)) throw new UnauthorizedException('Silakan masuk kembali.');
    const user = await this.db.client.user.findUnique({ where: { id: claims.sub } });
    if (!user?.active) throw new UnauthorizedException('Akun tidak aktif.');
    return user;
  }
  async profile(req: Request) {
    const user = await this.account(req);
    return { ...this.publicUser(user), name: user.name, email: user.email };
  }
  async accountId(req: Request): Promise<string> { return (await this.account(req)).id; }
  async updateProfile(req: Request, data: UpdateProfileDto) {
    const user = await this.account(req);
    try {
      const saved = await this.db.client.user.update({ where: { id: user.id }, data });
      return { ...this.publicUser(saved), name: saved.name, email: saved.email };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('Username atau email sudah digunakan.');
      throw error;
    }
  }
  private async confirmPassword(id: string, hash: string, password: string) {
    const key = `password:${id}`;
    const now = Date.now();
    const attempt = this.attempts.get(key);
    const current = attempt && attempt.expires > now ? attempt : { count: 0, expires: now + 15 * 60 * 1000 };
    if (current.count >= 10) throw new UnauthorizedException('Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
    current.count++; this.attempts.set(key, current);
    const [salt, expected] = hash.split(':');
    const actual = await derive(password, salt, 64) as Buffer;
    if (!expected || expected.length !== 128 || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new UnauthorizedException('Kata sandi saat ini salah.');
    this.attempts.delete(key);
  }
  async changePassword(req: Request, body: ChangePasswordDto) {
    const user = await this.account(req);
    await this.db.transaction(async () => {
      await this.db.q('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [user.id]);
      const current = await this.db.client.user.findUniqueOrThrow({ where: { id: user.id } });
      await this.confirmPassword(user.id, current.passwordHash, body.currentPassword);
      if (body.currentPassword === body.newPassword) throw new BadRequestException('Kata sandi baru harus berbeda.');
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(body.newPassword, salt, 64) as Buffer;
      await this.db.client.user.update({ where: { id: user.id }, data: { passwordHash: `${salt}:${hash.toString('hex')}` } });
      await this.db.client.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }
  async deleteAccount(req: Request, password: string) {
    const user = await this.account(req);
    await this.db.transaction(async () => {
      await this.db.q("SELECT pg_advisory_xact_lock(hashtext('manualmechanic-user-bootstrap'))::text");
      await this.db.q('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [user.id]);
      const current = await this.db.client.user.findUniqueOrThrow({ where: { id: user.id } });
      await this.confirmPassword(user.id, current.passwordHash, password);
      if (current.role === 'owner' && await this.db.client.user.count({ where: { active: true, role: 'owner' } }) <= 1) throw new ConflictException('Owner terakhir tidak dapat dihapus.');
      if (current.role === 'supervisor' && await this.db.client.user.count({ where: { active: true, role: 'supervisor' } }) <= 1) throw new ConflictException('Supervisor terakhir tidak dapat dihapus. Siapkan supervisor pengganti terlebih dahulu.');
      if (await this.db.client.user.count({ where: { active: true } }) <= 1) throw new ConflictException('Akun aktif terakhir tidak dapat dihapus.');
      if (await this.db.client.technician.findUnique({ where: { userId: user.id } })) throw new ConflictException('Akun masih terhubung ke profil teknisi dan riwayat pekerjaan. Hubungi pengelola.');
      await this.db.client.user.delete({ where: { id: user.id } });
    });
  }
  private clear(res: Response) { res.clearCookie(ACCESS, this.options('/api')); res.clearCookie(REFRESH, this.options('/api/auth')); res.clearCookie('mm_session', this.options('/api')); }
  private options(path: string) { return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.SESSION_COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && CONFIG.FRONTEND_ORIGIN.split(',').every((origin) => origin.trim().startsWith('https://'))), path }; }
  private async issue(userId: string, sessionId: string, refresh: string, expiresAt: Date, res: Response) {
    const token = await this.jwt.signAsync({ sid: sessionId, typ: 'access' }, { secret: process.env.JWT_SECRET, algorithm: 'HS256', subject: userId, issuer: 'manualmechanic', audience: 'manualmechanic-web', expiresIn: Math.min(ACCESS_SECONDS, Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))) });
    res.cookie(ACCESS, token, this.options('/api'));
    res.cookie(REFRESH, refresh, this.options('/api/auth'));
  }
  async login(username: string, password: string, req: Request, res: Response): Promise<User> {
    if (!this.enabled) throw new UnauthorizedException('Login tidak diaktifkan.');
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.expires <= now) this.attempts.delete(key);
    const key = req.ip ?? 'local';
    const attempt = this.attempts.get(key) ?? { count: 0, expires: now + 15 * 60 * 1000 };
    if (attempt.count >= 20 || this.attempts.size > 10000) throw new UnauthorizedException('Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
    attempt.count++; this.attempts.set(key, attempt);
    const user = await this.db.client.user.findUnique({ where: { username } });
    const [salt, hash] = (user?.passwordHash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const actual = await derive(password, salt, 64) as Buffer;
    if (!user || !user.active || hash.length !== 128 || !timingSafeEqual(actual, Buffer.from(hash, 'hex'))) throw new UnauthorizedException('Username atau kata sandi salah.');
    this.attempts.delete(key);
    await this.db.client.refreshSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.logout(req, res);
    const id = randomUUID();
    const refresh = `${id}.${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(now + SESSION_IDLE_MS);
    await this.db.client.refreshSession.create({ data: { id, userId: user.id, tokenHash: digest(refresh), expiresAt, createdAt: new Date(now) } });
    await this.issue(user.id, id, refresh, expiresAt, res);
    return this.publicUser(user);
  }
  async refresh(req: Request, res: Response): Promise<User> {
    const token = this.cookie(req, REFRESH);
    const id = token.split('.')[0];
    if (!this.enabled || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) { this.clear(res); throw new UnauthorizedException('Refresh token tidak valid.'); }
    const rotated = await this.db.transaction(async () => {
      await this.db.q('SELECT id FROM refresh_sessions WHERE id=$1 FOR UPDATE', [id]);
      const session = await this.db.client.refreshSession.findUnique({ where: { id }, include: { user: true } });
      if (!session || !this.valid(session)) return null;
      const tokenHash = digest(token);
      if (tokenHash !== session.tokenHash) {
        const consumed = await this.db.client.consumedRefreshToken.findUnique({ where: { tokenHash } });
        if (consumed?.sessionId === id) await this.db.client.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
        return null;
      }
      const next = `${id}.${randomBytes(32).toString('hex')}`;
      await this.db.client.consumedRefreshToken.create({ data: { tokenHash, sessionId: id, expiresAt: session.expiresAt } });
      await this.db.client.refreshSession.update({ where: { id }, data: { tokenHash: digest(next) } });
      return { session, next };
    });
    if (!rotated) { this.clear(res); throw new UnauthorizedException('Sesi berakhir atau token sudah digunakan. Silakan masuk kembali.'); }
    await this.issue(rotated.session.userId, id, rotated.next, rotated.session.expiresAt, res);
    return this.publicUser(rotated.session.user);
  }
  async logout(req: Request, res: Response) {
    const claims = await this.claims(req);
    const refresh = this.cookie(req, REFRESH);
    if (claims) await this.db.client.refreshSession.updateMany({ where: { id: claims.sid, userId: claims.sub }, data: { revokedAt: new Date() } });
    else if (refresh) await this.db.client.refreshSession.updateMany({ where: { tokenHash: digest(refresh) }, data: { revokedAt: new Date() } });
    this.clear(res);
  }
}
