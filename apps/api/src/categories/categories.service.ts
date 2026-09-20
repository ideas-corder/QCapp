import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CategoryEntity } from '../database/entities/category.entity';
import { CategoryAqlSetupEntity } from '../database/entities/category-aql.entity';
import {
  CreateCategoryDto,
  UpdateCategoryAqlDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { parseCsv, pick, toBool, toNumber } from '../common/csv';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(CategoryAqlSetupEntity)
    private readonly aqlRepo: Repository<CategoryAqlSetupEntity>,
    private readonly dataSource: DataSource,
  ) {}

  list() {
    return this.categoryRepo.find({
      where: { isActive: true },
      relations: ['aqlSetup'],
      order: { name: 'ASC' },
    });
  }

  async getById(id: string): Promise<CategoryEntity> {
    const c = await this.categoryRepo.findOne({
      where: { id },
      relations: ['aqlSetup'],
    });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const existing = await this.categoryRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Category name already exists');
    const category = this.categoryRepo.create({
      name: dto.name,
      description: dto.description ?? null,
    });
    const saved = await this.categoryRepo.save(category);
    if (dto.aqlSetup) {
      await this.upsertAql(saved.id, dto.aqlSetup);
    }
    return this.getById(saved.id);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    const cat = await this.getById(id);
    if (dto.name !== undefined) cat.name = dto.name;
    if (dto.description !== undefined) cat.description = dto.description;
    if (dto.isActive !== undefined) cat.isActive = dto.isActive;
    await this.categoryRepo.save(cat);
    return this.getById(id);
  }

  async setAql(categoryId: string, dto: UpdateCategoryAqlDto): Promise<CategoryAqlSetupEntity> {
    await this.getById(categoryId);
    return this.upsertAql(categoryId, dto);
  }

  private async upsertAql(
    categoryId: string,
    dto: UpdateCategoryAqlDto,
  ): Promise<CategoryAqlSetupEntity> {
    let existing = await this.aqlRepo.findOne({ where: { categoryId } });
    if (!existing) {
      existing = this.aqlRepo.create({
        categoryId,
        defaultAqlMajor: String(dto.defaultAqlMajor),
        defaultAqlMinor: String(dto.defaultAqlMinor),
        inspectionLevel: dto.inspectionLevel,
        autoFailOnCritical: dto.autoFailOnCritical ?? true,
        strictMode: dto.strictMode ?? false,
        maxAllowedDefects: dto.maxAllowedDefects ?? 10,
      });
    } else {
      existing.defaultAqlMajor = String(dto.defaultAqlMajor);
      existing.defaultAqlMinor = String(dto.defaultAqlMinor);
      existing.inspectionLevel = dto.inspectionLevel;
      if (dto.autoFailOnCritical !== undefined)
        existing.autoFailOnCritical = dto.autoFailOnCritical;
      if (dto.strictMode !== undefined) existing.strictMode = dto.strictMode;
      if (dto.maxAllowedDefects !== undefined)
        existing.maxAllowedDefects = dto.maxAllowedDefects;
    }
    return this.aqlRepo.save(existing);
  }

  /**
   * Bulk-import categories from a CSV string.
   *
   * CSV columns (header order is flexible, lookup is case/space-insensitive):
   *   name*, description,
   *   defaultAqlMajor* (number, e.g. 2.5),
   *   defaultAqlMinor* (number, e.g. 4.0),
   *   inspectionLevel* (one of: General Level I / II / III),
   *   autoFailOnCritical (true/false, default true),
   *   strictMode (true/false, default false),
   *   maxAllowedDefects (integer, default 10)
   *
   * Rows that fail validation are reported; valid rows are committed in a
   * single transaction so a partial batch never half-saves.
   */
  async bulkImport(
    csv: string,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const { rows } = parseCsv(csv);
    const errors: { row: number; message: string }[] = [];
    const toCreate: { row: number; dto: CreateCategoryDto }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // +2 = header line is row 1
      const name = pick(row, 'name', 'category');
      if (!name) {
        errors.push({ row: rowNum, message: 'Missing name' });
        return;
      }
      const aqlMajor = toNumber(pick(row, 'defaultAqlMajor', 'aqlMajor'));
      const aqlMinor = toNumber(pick(row, 'defaultAqlMinor', 'aqlMinor'));
      const level = pick(row, 'inspectionLevel', 'level');
      if (aqlMajor === null) {
        errors.push({ row: rowNum, message: 'defaultAqlMajor must be a number' });
        return;
      }
      if (aqlMinor === null) {
        errors.push({ row: rowNum, message: 'defaultAqlMinor must be a number' });
        return;
      }
      if (!level) {
        errors.push({ row: rowNum, message: 'inspectionLevel is required' });
        return;
      }
      const autoFailRaw = pick(row, 'autoFailOnCritical', 'autoFail');
      const strictRaw = pick(row, 'strictMode', 'strict');
      const maxDefects = toNumber(pick(row, 'maxAllowedDefects', 'maxDefects'));
      const autoFail = autoFailRaw ? toBool(autoFailRaw) : null;
      const strict = strictRaw ? toBool(strictRaw) : null;
      if (autoFailRaw && autoFail === null) {
        errors.push({ row: rowNum, message: `autoFailOnCritical must be true/false (got "${autoFailRaw}")` });
        return;
      }
      if (strictRaw && strict === null) {
        errors.push({ row: rowNum, message: `strictMode must be true/false (got "${strictRaw}")` });
        return;
      }
      toCreate.push({
        row: rowNum,
        dto: {
          name,
          description: pick(row, 'description') || undefined,
          aqlSetup: {
            defaultAqlMajor: aqlMajor,
            defaultAqlMinor: aqlMinor,
            inspectionLevel: level,
            autoFailOnCritical: autoFail ?? true,
            strictMode: strict ?? false,
            maxAllowedDefects: maxDefects ?? 10,
          },
        },
      });
    });

    if (toCreate.length === 0) {
      return { created: 0, errors };
    }

    let created = 0;
    await this.dataSource.transaction(async (manager) => {
      const catRepo = manager.getRepository(CategoryEntity);
      const aqlRepo = manager.getRepository(CategoryAqlSetupEntity);
      for (const { row, dto } of toCreate) {
        const existing = await catRepo.findOne({ where: { name: dto.name } });
        if (existing) {
          errors.push({ row, message: `Duplicate name "${dto.name}" — skipped` });
          continue;
        }
        const cat = catRepo.create({
          name: dto.name,
          description: dto.description ?? null,
        });
        const saved = await catRepo.save(cat);
        await aqlRepo.save(
          aqlRepo.create({
            categoryId: saved.id,
            defaultAqlMajor: String(dto.aqlSetup!.defaultAqlMajor),
            defaultAqlMinor: String(dto.aqlSetup!.defaultAqlMinor),
            inspectionLevel: dto.aqlSetup!.inspectionLevel,
            autoFailOnCritical: dto.aqlSetup!.autoFailOnCritical,
            strictMode: dto.aqlSetup!.strictMode,
            maxAllowedDefects: dto.aqlSetup!.maxAllowedDefects,
          }),
        );
        created++;
      }
    });

    return { created, errors };
  }
}
