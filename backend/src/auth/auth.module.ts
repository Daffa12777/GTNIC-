import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ProfileController } from './profile.controller';
import { InboxController } from './inbox.controller';

@Module({ controllers: [AuthController, ProfileController, InboxController], providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }], exports: [AuthService] })
export class AuthModule {}
