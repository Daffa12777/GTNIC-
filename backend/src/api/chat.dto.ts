import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
class ChatHistoryDto {
  @IsIn(['user', 'agent']) from!: string;
  @IsString() @Length(1, 1500) text!: string;
}
export class ChatDto {
  @IsString() @Length(1, 8000) message!: string;
  @IsOptional() @IsString() @Length(1, 80) case_id?: string | null;
  @IsBoolean() use_llm = false;
  @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => ChatHistoryDto) history: ChatHistoryDto[] = [];
}
