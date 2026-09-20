import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AqlMasterEntity } from '../database/entities/aql-master.entity';
import {
  CreateAqlMasterDto,
  UpdateAqlMasterDto,
} from './dto/aql-master.dto';
import { parseCsv, pick, toBool, toNumber } from '../common/csv';

/**
 * Format the user-visible code as `${minQty}-${maxQty}`.
 * Example: deriveCode(2, 8) === '2-8'; deriveCode(151, 280) === '151-280'.
 */
export function deriveCode(minQty: number, maxQty: number): string {
  return `${minQty}-${maxQty}`;
}

/**
 * Sanity-check the remaining integers: max ≥ min, sample ≥ 1, sample ≤ max.
 */
function validateConsistency(dto: {
  minQty?: number;
  maxQty?: number;
  sampleSize?: number;
}): void {
  if (
    dto.minQty !== undefined &&
    dto.maxQty !== undefined &&
    dto.maxQty < dto.minQty
  ) {
    throw new BadRequestException(
      `maxQty (${dto.maxQty}) must be ≥ minQty (${dto.minQty})`,
    );
  }
  if (
    dto.sampleSize !== undefined &&
    dto.maxQty !== undefined &&
    dto.sampleSize > dto.maxQty
  ) {
    throw new BadRequestException(
      `sampleSize / Inspect Qty (${dto.sampleSize}) must be ≤ maxQty (${dto.maxQty})`,
    );
  }
}

@Injectable()
export class AqlMasterService {
  constructor(
    @InjectRepository(AqlMasterEntity)
    private readonly repo: Repository<AqlMasterEntity>,
    private readonly dataSource: DataSource,
  ) {}

  list(opts?: { activeOnly?: boolean }) {
    return this.repo.find({
      where: opts?.activeOnly ? { isActive: true } : {},
      order: { minQty: 'ASC' },
    });
  }

  async getById(id: string): Promise<AqlMasterEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('AQL bucket not found');
    return found;
  }

  async getByQtyRange(
    minQty: number,
    maxQty: number,
  ): Promise<AqlMasterEntity | null> {
    return this.repo.findOne({ where: { minQty, maxQty } });
  }

  async create(dto: CreateAqlMasterDto): Promise<AqlMasterEntity> {
    validateConsistency({
      minQty: dto.minQty,
      maxQty: dto.maxQty,
      sampleSize: dto.sampleSize,
    });

    const existing = await this.repo.findOne({
      where: { minQty: dto.minQty, maxQty: dto.maxQty },
    });
    if (existing) {
      throw new ConflictException(
        `Lot-size range ${deriveCode(dto.minQty, dto.maxQty)} already exists`,
      );
    }

    return this.repo.save(
      this.repo.create({
        minQty: dto.minQty,
        maxQty: dto.maxQty,
        sampleSize: dto.sampleSize,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateAqlMasterDto,
  ): Promise<AqlMasterEntity> {
    const e = await this.getById(id);

    // Range-change guard: (min, max) is the natural key.
    const newMin = dto.minQty !== undefined ? dto.minQty : e.minQty;
    const newMax = dto.maxQty !== undefined ? dto.maxQty : e.maxQty;
    if (newMin !== e.minQty || newMax !== e.maxQty) {
      const clash = await this.repo.findOne({
        where: { minQty: newMin, maxQty: newMax },
      });
      if (clash && clash.id !== e.id) {
        throw new ConflictException(
          `Lot-size range ${deriveCode(newMin, newMax)} already exists`,
        );
      }
    }

    if (dto.minQty !== undefined) e.minQty = dto.minQty;
    if (dto.maxQty !== undefined) e.maxQty = dto.maxQty;
    if (dto.sampleSize !== undefined) e.sampleSize = dto.sampleSize;
    if (dto.description !== undefined) e.description = dto.description ?? null;
    if (dto.isActive !== undefined) e.isActive = dto.isActive;

    validateConsistency({
      minQty: e.minQty,
      maxQty: e.maxQty,
      sampleSize: e.sampleSize,
    });

    return this.repo.save(e);
  }

  async remove(id: string): Promise<void> {
    const e = await this.getById(id);
    await this.repo.remove(e);
  }

  /**
   * Bulk-import AQL buckets from CSV.
   * Columns (case/space-insensitive):
   *   minQty*       (integer)
   *   maxQty*       (integer, ≥ minQty)
   *   sampleSize*   (integer, ≥ 1; UI label: Inspect Qty)
   *   description   (optional)
   *   isActive      (true/false, default true)
   *
   * The "code" is auto-derived as `${minQty}-${maxQty}` and is not a column.
   * Pass/Reject counts are intentionally absent — they are computed at
   * runtime by `calculateSampling()`.
   */
  async bulkImport(
    csv: string,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const { rows } = parseCsv(csv);
    const errors: { row: number; message: string }[] = [];
    const toCreate: {
      row: number;
      dto: CreateAqlMasterDto;
    }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const minQty = toNumber(pick(row, 'minQty', 'min'));
      const maxQty = toNumber(pick(row, 'maxQty', 'max'));
      const sampleSize = toNumber(pick(row, 'sampleSize', 'sample', 'inspectQty', 'inspect'));

      for (const [k, v] of [
        ['minQty', minQty],
        ['maxQty', maxQty],
        ['sampleSize', sampleSize],
      ] as const) {
        if (v === null || !Number.isInteger(v)) {
          errors.push({ row: rowNum, message: `${k} must be an integer` });
          return;
        }
      }

      // TypeScript narrowing: we just checked they are numbers
      const mn = minQty as number;
      const mx = maxQty as number;
      const ss = sampleSize as number;

      if (mx < mn) {
        errors.push({
          row: rowNum,
          message: `maxQty (${mx}) must be ≥ minQty (${mn})`,
        });
        return;
      }
      if (ss < 1) {
        errors.push({ row: rowNum, message: `sampleSize must be ≥ 1` });
        return;
      }
      if (ss > mx) {
        errors.push({
          row: rowNum,
          message: `sampleSize (${ss}) must be ≤ maxQty (${mx})`,
        });
        return;
      }

      const activeRaw = pick(row, 'isActive', 'active', 'enabled');
      let isActive = true;
      if (activeRaw) {
        const parsed = toBool(activeRaw);
        if (parsed === null) {
          errors.push({
            row: rowNum,
            message: `isActive must be true/false (got "${activeRaw}")`,
          });
          return;
        }
        isActive = parsed;
      }

      toCreate.push({
        row: rowNum,
        dto: {
          minQty: mn,
          maxQty: mx,
          sampleSize: ss,
          description: (pick(row, 'description', 'desc') || '').trim() || undefined,
          isActive,
        },
      });
    });

    if (toCreate.length === 0) return { created: 0, errors };

    let created = 0;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AqlMasterEntity);
      for (const { row, dto } of toCreate) {
        const existing = await repo.findOne({
          where: { minQty: dto.minQty, maxQty: dto.maxQty },
        });
        if (existing) {
          errors.push({
            row,
            message: `Duplicate range "${deriveCode(dto.minQty, dto.maxQty)}" — skipped`,
          });
          continue;
        }
        await repo.save(repo.create(dto));
        created++;
      }
    });

    return { created, errors };
  }
}