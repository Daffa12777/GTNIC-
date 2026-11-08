import { Body, Controller, ForbiddenException, Get, Headers, HttpException, Param, Post, Req, SetMetadata, UsePipes, ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ToolsService } from '../tools/tools.service';

class AssignTechnicianDto {
  @IsOptional() @IsString() @Length(1, 80) technician_id?: string | null;
  @ValidateIf((_object, value: unknown) => value !== null) @IsString() @Length(1, 80) expected_technician_id!: string | null;
}
@Controller('work-orders')
@SetMetadata('roles', ['supervisor'])
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class WorkOrderAssignmentController {
  constructor(private readonly tools: ToolsService, private readonly auth: AuthService) {}
  private supervisor(role?: string) { if (role !== 'supervisor') throw new ForbiddenException('Hanya supervisor yang dapat menugaskan teknisi.'); }
  @Get(':id/assignment')
  async options(@Param('id') id: string, @Headers('x-role') role?: string) {
    this.supervisor(role);
    const result = await this.tools.assignmentOptions(id);
    if ('error' in result) throw new HttpException({ detail: result.error }, result.code ?? 404);
    return result;
  }
  @Post(':id/assign')
  async assign(@Param('id') id: string, @Body() data: AssignTechnicianDto, @Headers('x-role') role: string, @Req() req: Request) {
    this.supervisor(role);
    const user = await this.auth.current(req);
    const result = await this.tools.assignWorkOrder(id, data.technician_id ?? null, data.expected_technician_id, user?.username ?? 'supervisor-demo');
    if ('error' in result) throw new HttpException({ detail: result.error }, 'code' in result && typeof result.code === 'number' ? result.code : 409);
    return result;
  }
}
