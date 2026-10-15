import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';

export class CompleteWorkOrderDto {
  @IsString() @MinLength(1) @MaxLength(2000) @Matches(/\S/) root_cause!: string;
  @IsString() @MinLength(1) @MaxLength(2000) @Matches(/\S/) action!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) duration_min?: number;
}
