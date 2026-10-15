import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (!this.auth.enabled) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-mm-client'] !== 'web') throw new ForbiddenException('Header permintaan tidak valid.');
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const user = this.auth.current(req);
    if (!user) throw new UnauthorizedException('Sesi berakhir. Silakan masuk kembali.');
    // The role is derived from the authenticated session, never from client input.
    req.headers['x-role'] = user.role;
    return true;
  }
}
