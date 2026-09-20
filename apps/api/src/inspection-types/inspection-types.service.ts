import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InspectionTypeEntity } from '../database/entities/inspection-type.entity';
import { CreateInspectionTypeDto, UpdateInspectionTypeDto } from './dto/inspection-type.dto';
import { parseCsv, pick, toBool } from '../common/csv';

const normalizeCode = (raw: string): string => (raw || '').trim().toUpperCase();

@Injectable()
export class InspectionTypesService {
  constructor(
    @InjectRepository(InspectionTypeEntity)
    private readonly repo: Repository<InspectionTypeEntity>,
    private readonly dataSource: DataSource,
  ) {}

  list(opts?: { activeOnly?: boolean }) {
    return this.repo.find({
      where: opts?.activeOnly ? { isActive: true } : {},
      order: { code: 'ASC' },
    });
  }

  async getById(id: string): Promise<InspectionTypeEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Inspection type not found');
    return found;
  }

  async getActiveByCode(code: string): Promise<InspectionTypeEntity | null> {
    return this.repo.findOne({
      where: { code: normalizeCode(code), isActive: true },
    });
  }

  async create(dto: CreateInspectionTypeDto): Promise<InspectionTypeEntity> {
    const code = normalizeCode(dto.code);
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) throw new ConflictException(`Code "${code}" already exists`);

    return this.repo.save(
      this.repo.create({
        code,
        label: dto.label.trim(),
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateInspectionTypeDto,
  ): Promise<InspectionTypeEntity> {
    const t = await this.getById(id);

    if (dto.code !== undefined) {
      const newCode = normalizeCode(dto.code);
      if (newCode !== t.code) {
        const clash = await this.repo.findOne({ where: { code: newCode } });
        if (clash && clash.id !== t.id)
          throw new ConflictException(`Code "${newCode}" already exists`);
        t.code = newCode;
      }
    }
    if (dto.label !== undefined) t.label = dto.label.trim();
    if (dto.description !== undefined) t.description = dto.description ?? null;
    if (dto.isActive !== undefined) t.isActive = dto.isActive;
    return this.repo.save(t);
  }

  async remove(id: string): Promise<void> {
    const t = await this.getById(id);
    await this.repo.remove(t);
  }

  /**
   * Bulk-import inspection types from CSV.
   * Columns (case/space-insensitive):
   *   code*  (uppercase A-Z / 0-9 / dash / underscore, max 32 chars)
   *   label* (human-friendly name)
   *   description (optional)
   *   isActive (true/false, default true)
   */
  async bulkImport(
    csv: string,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const { rows } = parseCsv(csv);
    const errors: { row: number; message: string }[] = [];
    const toCreate: { row: number; dto: CreateInspectionTypeDto }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const code = normalizeCode(pick(row, 'code'));
      const label = (pick(row, 'label', 'name') || '').trim();
      const description = (pick(row, 'description', 'desc') || '').trim();

      if (!code) {
        errors.push({ row: rowNum, message: 'Missing code' });
        return;
      }
      if (!/^[A-Z0-9_-]{1,32}$/.test(code)) {
        errors.push({
          row: rowNum,
          message: `code must be uppercase A–Z / 0–9 / dash / underscore (got "${code}")`,
        });
        return;
      }
      if (!label) {
        errors.push({ row: rowNum, message: 'Missing label' });
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
          code,
          label,
          description: description || undefined,
          isActive,
        },
      });
    });

    if (toCreate.length === 0) return { created: 0, errors };

    let created = 0;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(InspectionTypeEntity);
      for (const { row, dto } of toCreate) {
        const existing = await repo.findOne({ where: { code: dto.code } });
        if (existing) {
          errors.push({
            row,
            message: `Duplicate code "${dto.code}" — skipped`,
          });
          continue;
        }
        await repo.save(
          repo.create({
            code: dto.code,
            label: dto.label,
            description: dto.description ?? null,
            isActive: dto.isActive ?? true,
          }),
        );
        created++;
      }
    });

    return { created, errors };
  }
}