import { Body, Controller, Get, Header, Post, Req, Res, SetMetadata, UsePipes, ValidationPipe } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() @Length(1, 100) username!: string;
  @IsString() @Length(1, 256) password!: string;
}

@SetMetadata('public', true)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() req: Request) { return { enabled: this.auth.enabled, user: await this.auth.current(req) }; }
  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return { enabled: this.auth.enabled, user: await this.auth.refresh(req, res) }; }
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { enabled: this.auth.enabled, user: await this.auth.login(body.username, body.password, req, res) };
  }
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { await this.auth.logout(req, res); return { ok: true }; }
}
