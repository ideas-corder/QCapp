import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadsService {
  private readonly uploadDir = path.resolve(
    process.env.UPLOAD_DIR || './uploads',
  );

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Accepts a multer file (binary blob) and writes it to disk under
   * a UUID-prefixed name. Returns the public URL the API will serve
   * it at.
   */
  savePhoto(file: Express.Multer.File): {
    url: string;
    mimeType: string;
    size: number;
  } {
    if (!file) throw new Error('No file provided');
    const ext = this.extensionFor(file.mimetype);
    const name = `${randomUUID()}${ext}`;
    const dest = path.join(this.uploadDir, name);
    fs.writeFileSync(dest, file.buffer);
    return {
      url: `/uploads/${name}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  resolveToDisk(filename: string): string {
    const safe = path.basename(filename);
    return path.join(this.uploadDir, safe);
  }

  private extensionFor(mime: string): string {
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/heic') return '.heic';
    return '';
  }
}
