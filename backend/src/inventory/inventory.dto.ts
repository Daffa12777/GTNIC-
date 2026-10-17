import { IsInt, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
export class CreatePartDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 40) @Matches(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/) part_id!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 160) name!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 100) location!: string;
  @IsInt() @Min(0) @Max(1000000) stock!: number;
  @IsInt() @Min(0) @Max(1000000) min_stock!: number;
}
export class AdjustStockDto {
  @IsUUID() operationId!: string;
  @IsInt() @Min(-1000000) @Max(1000000) delta!: number;
  @IsInt() @Min(0) expectedStock!: number;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(5, 500) reason!: string;
}
