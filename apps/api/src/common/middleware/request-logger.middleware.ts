import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const contentLength = res.getHeader('content-length');
      const size = contentLength === undefined ? '-' : String(contentLength);
      const userAgent = req.get('user-agent') ?? '-';

      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms ${size}b ip=${req.ip} ua="${userAgent}"`,
      );
    });

    next();
  }
}
