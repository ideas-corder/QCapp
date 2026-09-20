import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductCategoryEntity } from '../database/entities/product-category.entity';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from './dto/product-category.dto';
import { parseCsv, pick, toBool } from '../common/csv';

const normalizeCode = (raw: string): string => (raw || '').trim().toUpperCase();

@Injectable()
export class ProductCategoriesService {
  constructor(
    @InjectRepository(ProductCategoryEntity)
    private readonly repo: Repository<ProductCategoryEntity>,
    private readonly dataSource: DataSource,
  ) {}

  list(opts?: { activeOnly?: boolean }) {
    return this.repo.find({
      where: opts?.activeOnly ? { isActive: true } : {},
      order: { code: 'ASC' },
    });
  }

  async getById(id: string): Promise<ProductCategoryEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Product category not found');
    return found;
  }

  async getActiveByCode(code: string): Promise<ProductCategoryEntity | null> {
    return this.repo.findOne({
      where: { code: normalizeCode(code), isActive: true },
    });
  }

  async create(
    dto: CreateProductCategoryDto,
  ): Promise<ProductCategoryEntity> {
    const code = normalizeCode(dto.code);
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) throw new ConflictException(`Code "${code}" already exists`);

    return this.repo.save(
      this.repo.create({
        code,
        name: dto.name.trim(),
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateProductCategoryDto,
  ): Promise<ProductCategoryEntity> {
    const p = await this.getById(id);

    if (dto.code !== undefined) {
      const newCode = normalizeCode(dto.code);
      if (newCode !== p.code) {
        const clash = await this.repo.findOne({ where: { code: newCode } });
        if (clash && clash.id !== p.id)
          throw new ConflictException(`Code "${newCode}" already exists`);
        p.code = newCode;
      }
    }
    if (dto.name !== undefined) p.name = dto.name.trim();
    if (dto.description !== undefined) p.description = dto.description ?? null;
    if (dto.isActive !== undefined) p.isActive = dto.isActive;
    return this.repo.save(p);
  }

  async remove(id: string): Promise<void> {
    const p = await this.getById(id);
    await this.repo.remove(p);
  }

  /**
   * Bulk-import product categories from CSV.
   * Columns (case/space-insensitive):
   *   code*      (uppercase A-Z / 0-9 / dash / underscore, max 64)
   *   name*      (human-friendly name)
   *   description (optional)
   *   isActive   (true/false, default true)
   */
  async bulkImport(
    csv: string,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const { rows } = parseCsv(csv);
    const errors: { row: number; message: string }[] = [];
    const toCreate: { row: number; dto: CreateProductCategoryDto }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const code = normalizeCode(pick(row, 'code'));
      const name = (pick(row, 'name', 'label') || '').trim();
      const description = (pick(row, 'description', 'desc') || '').trim();

      if (!code) {
        errors.push({ row: rowNum, message: 'Missing code' });
        return;
      }
      if (!/^[A-Z0-9_-]{1,64}$/.test(code)) {
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
          description: description || undefined,
          isActive,
        },
      });
    });

    if (toCreate.length === 0) return { created: 0, errors };

    let created = 0;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductCategoryEntity);
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
