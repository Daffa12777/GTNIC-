import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;
export class UpdateProfileDto {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
  @Transform(trim) @IsString() @Length(3, 100) @Matches(/^[a-zA-Z0-9_.-]+$/) username!: string;
}
export class ConfirmPasswordDto {
  @IsString() @Length(1, 256) currentPassword!: string;
}
export class ChangePasswordDto extends ConfirmPasswordDto {
  @IsString() @Length(12, 256) newPassword!: string;
}
