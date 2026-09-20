import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  InspectionViewEntity,
  InspectionViewLayoutJson,
} from '../database/entities/inspection-view.entity';
import {
  CreateInspectionViewDto,
  UpdateInspectionViewDto,
} from './dto/inspection-view.dto';

/**
 * CRUD over the `inspection_views` table.
 *
 * Ownership rules:
 *   - Built-in views are visible to everyone but immutable.
 *   - User-owned views are visible only to their owner and fully
 *     mutable / deletable.
 *
 * No bulk-import or seeder for ad-hoc views — there is exactly one
 * built-in ("Default"), seeded at boot, which carries no layout and
 * therefore means "show everything in default order".
 */
@Injectable()
export class InspectionViewsService {
  constructor(
    @InjectRepository(InspectionViewEntity)
    private readonly viewRepo: Repository<InspectionViewEntity>,
  ) {}

  /** Returns built-ins + the user's own views, sorted built-ins first. */
  list(userId: string) {
    return this.viewRepo
      .createQueryBuilder('v')
      .where('v.is_built_in = true OR v.owner_id = :uid', { uid: userId })
      .orderBy('v.is_built_in', 'DESC')
      .addOrderBy('v.name', 'ASC')
      .getMany();
  }

  async getById(id: string, userId: string): Promise<InspectionViewEntity> {
    const v = await this.viewRepo.findOne({ where: { id } });
    if (!v) throw new NotFoundException('View not found');
    if (!v.isBuiltIn && v.ownerId !== userId)
      throw new ForbiddenException('Not your view');
    return v;
  }

  create(dto: CreateInspectionViewDto, ownerId: string) {
    const view = this.viewRepo.create({
      name: dto.name,
      description: dto.description ?? '',
      layout: (dto.layout ?? {}) as InspectionViewLayoutJson,
      isBuiltIn: false,
      ownerId,
    });
    return this.viewRepo.save(view);
  }

  async update(
    id: string,
    dto: UpdateInspectionViewDto,
    userId: string,
  ): Promise<InspectionViewEntity> {
    const v = await this.getById(id, userId);
    if (v.isBuiltIn)
      throw new ForbiddenException('Built-in views are read-only');
    if (dto.name !== undefined) v.name = dto.name;
    if (dto.description !== undefined) v.description = dto.description;
    if (dto.layout !== undefined)
      v.layout = dto.layout as InspectionViewLayoutJson;
    return this.viewRepo.save(v);
  }

  async remove(id: string, userId: string): Promise<void> {
    const v = await this.getById(id, userId);
    if (v.isBuiltIn)
      throw new ForbiddenException('Built-in views cannot be deleted');
    await this.viewRepo.remove(v);
  }

  /**
   * Idempotently ensure the system "Default" view exists. Its layout
   * is empty so the front-end treats it as "show every column in
   * default order with default widths".
   */
  async seedBuiltIn(): Promise<void> {
    const exists = await this.viewRepo.findOne({
      where: { name: 'Default', isBuiltIn: true },
    });
    if (!exists) {
      await this.viewRepo.save(
        this.viewRepo.create({
          name: 'Default',
          description: 'Show every column in default order',
          isBuiltIn: true,
          ownerId: null,
          layout: {},
        }),
      );
    }
  }
}