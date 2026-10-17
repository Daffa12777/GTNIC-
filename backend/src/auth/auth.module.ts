import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ProfileController } from './profile.controller';

@Module({ controllers: [AuthController, ProfileController], providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }] })
export class AuthModule {}
