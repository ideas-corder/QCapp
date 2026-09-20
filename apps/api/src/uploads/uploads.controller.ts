import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { memoryStorage } from 'multer';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/roles.guard';

// Only the upload endpoint is auth-gated. The read endpoint
// (`GET /uploads/:filename`) is intentionally public because the
// web admin and the generated PDFs both consume uploaded photos
// through the same origin (`<img src="/uploads/xxx">`, signature
// cells, and the new-installation form preview). Filenames are
// UUIDs so the surface is effectively unguessable.
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('photo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024,
      },
    }),
  )
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.savePhoto(file);
  }

  @Get(':filename')
  serve(@Param('filename') filename: string, @Res() res: Response) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const diskPath = this.uploadsService.resolveToDisk(safe);
    if (!fs.existsSync(diskPath)) throw new NotFoundException('Not found');
    res.sendFile(diskPath);
  }
}
