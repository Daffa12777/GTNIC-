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
  session(@Req() req: Request) { return { enabled: this.auth.enabled, user: this.auth.current(req) }; }
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { enabled: this.auth.enabled, user: await this.auth.login(body.username, body.password, req, res) };
  }
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { this.auth.logout(req, res); return { ok: true }; }
}
