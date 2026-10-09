import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('API Error');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionName =
      exception instanceof Error ? exception.name : 'UnknownException';
    const message = this.exceptionMessage(exception);
    const summary = `${request.method} ${request.originalUrl} ${status} ${exceptionName}: ${message} ip=${request.ip}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        summary,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(summary);
    }

    const body =
      exception instanceof HttpException
        ? this.httpExceptionBody(exception, status)
        : {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
          };
    const { httpAdapter } = this.adapterHost;

    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }
    httpAdapter.reply(response, body, status);
  }

  private exceptionMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return this.clean(response);
      if (response && typeof response === 'object') {
        const message = (response as Record<string, unknown>).message;
        if (Array.isArray(message)) {
          return this.clean(message.map(String).join('; '));
        }
        if (typeof message === 'string') return this.clean(message);
      }
    }

    if (exception instanceof Error) return this.clean(exception.message);
    return this.clean(String(exception));
  }

  private httpExceptionBody(
    exception: HttpException,
    status: number,
  ): string | Record<string, unknown> {
    const response = exception.getResponse();
    return typeof response === 'string'
      ? { statusCode: status, message: response }
      : (response as Record<string, unknown>);
  }

  private clean(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').slice(0, 500);
  }
}
