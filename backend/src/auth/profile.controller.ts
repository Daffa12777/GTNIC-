import { Body, Controller, Get, Header, Post, Req, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ConfirmPasswordDto, UpdateProfileDto } from './profile.dto';
import { RatePolicy } from '../security/rate-policy';

@Controller('profile')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ProfileController {
  constructor(private readonly auth: AuthService) {}
  @Get() @Header('Cache-Control', 'no-store')
  profile(@Req() req: Request) { return this.auth.profile(req); }
  @Post() @Header('Cache-Control', 'no-store')
  update(@Req() req: Request, @Body() body: UpdateProfileDto) { return this.auth.updateProfile(req, body); }
  @Post('password')
  @RatePolicy('sensitive')
  async password(@Req() req: Request, @Body() body: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(req, body); await this.auth.logout(req, res); return { ok: true };
  }
  @Post('delete')
  @RatePolicy('sensitive')
  async remove(@Req() req: Request, @Body() body: ConfirmPasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.deleteAccount(req, body.currentPassword); await this.auth.logout(req, res); return { ok: true };
  }
}
