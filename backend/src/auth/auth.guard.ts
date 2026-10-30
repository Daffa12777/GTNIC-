import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { allowedOrigins } from '../security/http-security';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.auth.enabled) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-mm-client'] !== 'web') throw new ForbiddenException('Header permintaan tidak valid.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !allowedOrigins().has(req.headers.origin)) throw new ForbiddenException('Origin tidak diizinkan.');
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const user = await this.auth.current(req);
    if (!user) throw new UnauthorizedException('Sesi berakhir. Silakan masuk kembali.');
    const roles = this.reflector.getAllAndOverride<readonly string[]>('roles', [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException('Peran akun tidak memiliki izin.');
    // The role is derived from the authenticated session, never from client input.
    req.headers['x-role'] = user.role;
    return true;
  }
}
