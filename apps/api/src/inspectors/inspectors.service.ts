import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InspectorEntity } from '../database/entities/inspector.entity';
import { CreateInspectorDto, UpdateInspectorDto } from './dto/inspector.dto';
import { parseCsv, pick, toBool } from '../common/csv';

const normalizeCode = (raw: string): string => (raw || '').trim().toUpperCase();

@Injectable()
export class InspectorsService {
  constructor(
    @InjectRepository(InspectorEntity)
    private readonly repo: Repository<InspectorEntity>,
    private readonly dataSource: DataSource,
  ) {}

  list(opts?: { activeOnly?: boolean }) {
    return this.repo.find({
      where: opts?.activeOnly ? { isActive: true } : {},
      order: { code: 'ASC' },
    });
  }

  async getById(id: string): Promise<InspectorEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Inspector not found');
    return found;
  }

  async getActiveByCode(code: string): Promise<InspectorEntity | null> {
    return this.repo.findOne({
      where: { code: normalizeCode(code), isActive: true },
    });
  }

  async create(dto: CreateInspectorDto): Promise<InspectorEntity> {
    const code = normalizeCode(dto.code);
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) throw new ConflictException(`Code "${code}" already exists`);

    return this.repo.save(
      this.repo.create({
        code,
        name: dto.name.trim(),
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateInspectorDto,
  ): Promise<InspectorEntity> {
    const i = await this.getById(id);

    if (dto.code !== undefined) {
      const newCode = normalizeCode(dto.code);
      if (newCode !== i.code) {
        const clash = await this.repo.findOne({ where: { code: newCode } });
        if (clash && clash.id !== i.id)
          throw new ConflictException(`Code "${newCode}" already exists`);
        i.code = newCode;
      }
    }
    if (dto.name !== undefined) i.name = dto.name.trim();
    if (dto.email !== undefined) i.email = dto.email ?? null;
    if (dto.phone !== undefined) i.phone = dto.phone ?? null;
    if (dto.notes !== undefined) i.notes = dto.notes ?? null;
    if (dto.isActive !== undefined) i.isActive = dto.isActive;
    return this.repo.save(i);
  }

  async remove(id: string): Promise<void> {
    const i = await this.getById(id);
    await this.repo.remove(i);
  }

  /**
   * Bulk-import inspectors from CSV.
   * Columns (case/space-insensitive):
   *   code*      (uppercase A-Z / 0-9 / dash / underscore, max 32)
   *   name*      (human-friendly name)
   *   email      (optional, valid email)
   *   phone      (optional)
   *   notes      (optional)
   *   isActive   (true/false, default true)
   */
  async bulkImport(
    csv: string,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const { rows } = parseCsv(csv);
    const errors: { row: number; message: string }[] = [];
    const toCreate: { row: number; dto: CreateInspectorDto }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const code = normalizeCode(pick(row, 'code'));
      const name = (pick(row, 'name') || '').trim();

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
      if (!name) {
        errors.push({ row: rowNum, message: 'Missing name' });
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
          name,
          email: (pick(row, 'email') || '').trim() || undefined,
          phone: (pick(row, 'phone') || '').trim() || undefined,
          notes: (pick(row, 'notes') || '').trim() || undefined,
          isActive,
        },
      });
    });

    if (toCreate.length === 0) return { created: 0, errors };

    let created = 0;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(InspectorEntity);
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
            name: dto.name,
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            notes: dto.notes ?? null,
            isActive: dto.isActive ?? true,
          }),
        );
        created++;
      }
    });

    return { created, errors };
  }
}
