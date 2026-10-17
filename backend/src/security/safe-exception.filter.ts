import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('HttpError');
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const parserStatus = exception && typeof exception === 'object' && 'status' in exception ? exception.status : undefined;
    const status = exception instanceof HttpException ? exception.getStatus() : typeof parserStatus === 'number' && [400, 413, 415].includes(parserStatus) ? parserStatus : 500;
    const requestId = response.getHeader('X-Request-Id');
    if (status >= 500) {
      this.log.error(`${request.method} ${request.path} failed (${exception instanceof Error ? exception.name : 'UnknownError'}), requestId=${String(requestId ?? '')}`);
      response.status(status).json({ statusCode: status, message: status === 503 ? 'Layanan sementara tidak tersedia. Coba lagi nanti.' : 'Terjadi kesalahan internal. Hubungi pengelola dengan ID permintaan.', requestId }); return;
    }
    const detail = exception instanceof HttpException ? exception.getResponse() : { message: status === 413 ? 'Body melebihi batas 128 KB.' : status === 415 ? 'Format body tidak didukung.' : 'JSON tidak valid.' };
    response.status(status).json({ statusCode: status, ...(typeof detail === 'string' ? { message: detail } : detail), requestId });
  }
}
