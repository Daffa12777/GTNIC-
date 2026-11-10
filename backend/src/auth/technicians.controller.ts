import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, NotFoundException, Param, Post, Req, SetMetadata, UsePipes, ValidationPipe } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request } from 'express';
import { DbService } from '../db/db.service';
import { AuthService, canSupervise } from './auth.service';
import { RatePolicy } from '../security/rate-policy';
import { now } from '../domain';

const derive = promisify(scrypt);
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
class LinkTechnicianDto {
  @Transform(trim) @IsString() @Length(3, 100) @Matches(/^[a-zA-Z0-9_.-]+$/) username!: string;
}
class CreateAccountDto extends LinkTechnicianDto {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @IsString() @Length(12, 256) password!: string;
}
class CreateTechnicianDto extends CreateAccountDto {
  @IsIn(['mekanik', 'listrik']) skill!: string;
  @IsIn(['junior', 'senior']) level!: string;
}
const userSelect = { username: true, name: true, role: true, active: true } as const;

@Controller('technicians')
@SetMetadata('roles', ['supervisor'])
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class TechniciansController {
  constructor(private readonly db: DbService, private readonly auth: AuthService) {}
  private supervisor(role: string) { if (!canSupervise(role)) throw new ForbiddenException('Hanya owner atau supervisor yang dapat mengelola teknisi.'); }
  @Get('manage') @Header('Cache-Control', 'no-store')
  async list(@Headers('x-role') role: string) {
    this.supervisor(role);
    const [technicians, accounts, supervisors] = await Promise.all([
      this.db.client.technician.findMany({ orderBy: { name: 'asc' }, include: { user: { select: userSelect } } }),
      this.db.client.user.findMany({ where: { role: 'teknisi', active: true, technician: null }, select: userSelect, orderBy: { username: 'asc' } }),
      role === 'owner' ? this.db.client.user.findMany({ where: { role: 'supervisor' }, select: userSelect, orderBy: { username: 'asc' } }) : [],
    ]);
    return { technicians, accounts, supervisors };
  }
  private async createAccount(body: CreateAccountDto, role: 'supervisor' | 'teknisi', actor: string, profile?: CreateTechnicianDto) {
    const salt = randomBytes(16).toString('hex'), hash = await derive(body.password, salt, 64) as Buffer;
    try {
      return await this.db.transaction(async () => {
        const user = await this.db.client.user.create({ data: { username: body.username, name: body.name, passwordHash: `${salt}:${hash.toString('hex')}`, role }, select: { ...userSelect, id: true } });
        const result = profile ? await this.db.client.technician.create({ data: { id: `T-${randomUUID()}`, name: body.name, skill: profile.skill, level: profile.level, available: true, userId: user.id }, include: { user: { select: userSelect } } }) : { username: user.username, name: user.name, role: user.role, active: user.active };
        await this.db.client.agentLog.create({ data: { ts: now(), step: 'account_management', tool: `create_${role}`, input: JSON.stringify({ actor, username: body.username, role, ...(profile ? { skill: profile.skill, level: profile.level } : {}) }), output: JSON.stringify({ created: true }) } });
        return result;
      });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('Username sudah digunakan. Pilih username lain.');
      throw error;
    }
  }
  @Post() @RatePolicy('sensitive')
  async create(@Headers('x-role') role: string, @Req() req: Request, @Body() body: CreateTechnicianDto) {
    this.supervisor(role);
    return this.createAccount(body, 'teknisi', (await this.auth.current(req))?.username ?? 'supervisor-demo', body);
  }
  @Post('supervisors') @SetMetadata('roles', ['owner']) @RatePolicy('sensitive')
  async createSupervisor(@Headers('x-role') role: string, @Req() req: Request, @Body() body: CreateAccountDto) {
    if (role !== 'owner') throw new ForbiddenException('Hanya owner yang dapat membuat akun supervisor.');
    return this.createAccount(body, 'supervisor', (await this.auth.current(req))?.username ?? 'owner-demo');
  }
  @Post('supervisors/:username/deactivate') @SetMetadata('roles', ['owner']) @RatePolicy('sensitive')
  async deactivate(@Param('username') username: string, @Headers('x-role') role: string, @Req() req: Request) {
    if (role !== 'owner') throw new ForbiddenException('Hanya owner yang dapat menonaktifkan supervisor.');
    const actor = (await this.auth.current(req))?.username ?? 'owner-demo';
    return this.db.transaction(async () => {
      const user = await this.db.client.user.findUnique({ where: { username } });
      if (!user || user.role !== 'supervisor') throw new BadRequestException('Pilih akun supervisor. Akun owner tidak dapat dinonaktifkan di sini.');
      await this.db.client.user.update({ where: { id: user.id }, data: { active: false } });
      await this.db.client.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.db.client.agentLog.create({ data: { ts: now(), step: 'account_management', tool: 'deactivate_supervisor', input: JSON.stringify({ actor, username }), output: JSON.stringify({ active: false }) } });
      return { ok: true };
    });
  }
  @Post(':id/account') @RatePolicy('sensitive')
  async link(@Param('id') id: string, @Headers('x-role') role: string, @Req() req: Request, @Body() body: LinkTechnicianDto) {
    this.supervisor(role);
    const actor = (await this.auth.current(req))?.username ?? 'supervisor-demo';
    try {
      return await this.db.transaction(async () => {
        await this.db.q('SELECT id FROM technicians WHERE id=$1 FOR UPDATE', [id]);
        const technician = await this.db.client.technician.findUnique({ where: { id } });
        if (!technician) throw new NotFoundException('Profil teknisi tidak ditemukan.');
        if (technician.userId) throw new ConflictException('Profil teknisi sudah memiliki akun.');
        const user = await this.db.client.user.findUnique({ where: { username: body.username }, include: { technician: true } });
        if (!user || user.role !== 'teknisi' || !user.active) throw new BadRequestException('Pilih akun teknisi yang aktif. Akun supervisor atau owner tidak dapat ditautkan.');
        if (user.technician) throw new ConflictException('Akun sudah terhubung ke teknisi lain.');
        const result = await this.db.client.technician.update({ where: { id }, data: { userId: user.id }, include: { user: { select: userSelect } } });
        await this.db.client.agentLog.create({ data: { ts: now(), step: 'account_management', tool: 'link_technician', input: JSON.stringify({ actor, username: body.username, technician_id: id }), output: JSON.stringify({ linked: true }) } });
        return result;
      });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('Akun sudah terhubung ke teknisi lain.');
      throw error;
    }
  }
}
