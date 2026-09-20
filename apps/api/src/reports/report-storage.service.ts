import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Owns the on-disk layout for generated report PDFs.
 *
 * Layout:
 *   <root>/<inspectionId>/<reportId>.pdf
 *
 * `root` defaults to `apps/api/storage/reports` (resolved relative to
 * CWD). Configurable via `REPORTS_STORAGE_DIR` if the deployment puts
 * the storage volume somewhere else (e.g. a mounted share).
 *
 * Files are never overwritten — every generation produces a new
 * `<reportId>` sub-path, so the audit trail can compare hashes
 * without worrying about someone editing an archived PDF in place.
 */
@Injectable()
export class ReportStorageService {
  private readonly logger = new Logger(ReportStorageService.name);
  private readonly root: string;

  constructor() {
    this.root = path.resolve(
      process.env.REPORTS_STORAGE_DIR || path.join(process.cwd(), 'storage', 'reports'),
    );
    // Lazy mkdir — the directory may not exist on a fresh deploy.
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
    }
  }

  /** Generate a fresh relative path for a new report. */
  newPath(inspectionId: string, reportId?: string): {
    relative: string;
    absolute: string;
  } {
    const id = reportId ?? randomUUID();
    const relative = path.join(inspectionId, `${id}.pdf`);
    const absolute = path.join(this.root, relative);
    const dir = path.dirname(absolute);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return { relative, absolute };
  }

  /** Resolve a relative path produced by `newPath()` back to disk. */
  resolve(relative: string): string {
    return path.join(this.root, relative);
  }

  /** True if the file exists on disk. */
  exists(relative: string): boolean {
    return fs.existsSync(this.resolve(relative));
  }

  write(absolute: string, bytes: Buffer | Uint8Array): void {
    fs.writeFileSync(absolute, bytes);
  }

  read(relative: string): Buffer {
    return fs.readFileSync(this.resolve(relative));
  }

  /** Compute SHA-256 hex digest of an in-memory buffer. */
  sha256(bytes: Buffer | Uint8Array): string {
    const { createHash } = require('crypto') as typeof import('crypto');
    return createHash('sha256').update(bytes).digest('hex');
  }

  /** Best-effort relative-to-storage path for log lines. */
  get storageRoot(): string {
    return this.root;
  }
}
