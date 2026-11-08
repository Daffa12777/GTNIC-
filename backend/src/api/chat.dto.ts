import { Type } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, ValidateNested } from 'class-validator';

export const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;
export class ChatImageDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp']) mimeType!: string;
  @IsString() @Length(1, Math.ceil(MAX_CHAT_IMAGE_BYTES / 3) * 4) data!: string;
}

export function validateChatImage(image?: ChatImageDto): ChatImageDto | undefined {
  if (!image) return undefined;
  const bytes = Buffer.from(image.data, 'base64');
  if (bytes.length > MAX_CHAT_IMAGE_BYTES || bytes.toString('base64') !== image.data) {
    throw new BadRequestException('Gambar harus berupa base64 valid dengan ukuran maksimal 2 MB.');
  }
  const signatures: Record<string, boolean> = {
    'image/jpeg': bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
  };
  if (!signatures[image.mimeType]) throw new BadRequestException('Isi gambar tidak sesuai format JPG, PNG, atau WebP.');
  return image;
}
class ChatHistoryDto {
  @IsIn(['user', 'agent']) from!: string;
  @IsString() @Length(1, 1500) text!: string;
}
export class ChatDto {
  @IsString() @Length(1, 8000) message!: string;
  @IsOptional() @IsString() @Length(1, 80) case_id?: string | null;
  @IsBoolean() use_llm = false;
  @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => ChatHistoryDto) history: ChatHistoryDto[] = [];
  @IsOptional() @ValidateNested() @Type(() => ChatImageDto) image?: ChatImageDto;
}
