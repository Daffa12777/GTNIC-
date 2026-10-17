import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;
export class PumpRequestDto { @Transform(trim) @IsString() @Length(1, 80) pump_id!: string; }
export class DiagnoseDto extends PumpRequestDto {
  @IsString() @MaxLength(4000) complaint = '';
  @IsBoolean() use_llm = false;
}
export class AnswerDto { @Transform(trim) @IsString() @Length(1, 4000) text!: string; }
export class RejectDto { @Transform(trim) @IsString() @MaxLength(2000) note = ''; }
export class AutoDto { @IsBoolean() enabled!: boolean; }
export class FaultDto extends PumpRequestDto {
  @IsIn(['pump', 'valve', 'cooler', 'accumulator']) fault!: string;
  @IsNumber() @Min(0) @Max(1) rate = 0.07;
  @IsNumber() @Min(0) @Max(1) severity = 0;
}
export class DropoutDto extends PumpRequestDto {
  @IsOptional() @IsIn(['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PS6', 'EPS1', 'FS1', 'FS2', 'TS1', 'TS2', 'TS3', 'TS4', 'VS1', 'CE', 'CP', 'SE']) sensor: string | null = null;
}
