import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchandiserEntity } from '../database/entities/merchandiser.entity';
import {
  CreateMerchandiserDto,
  ListMerchandisersQueryDto,
  UpdateMerchandiserDto,
} from './dto/merchandiser.dto';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class MerchandisersService {
  constructor(
    @InjectRepository(MerchandiserEntity)
    private readonly repo: Repository<MerchandiserEntity>,
  ) {}

  list(query: ListMerchandisersQueryDto): Promise<MerchandiserEntity[]> {
    return this.repo.find({
      where:
        query.isActive === undefined
          ? {}
          : { isActive: query.isActive },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<MerchandiserEntity> {
    const merchandiser = await this.repo.findOne({ where: { id } });
    if (!merchandiser) {
      throw new NotFoundException('Merchandiser not found');
    }
    return merchandiser;
  }

  async create(dto: CreateMerchandiserDto): Promise<MerchandiserEntity> {
    const email = normalizeEmail(dto.email);
    await this.ensureEmailAvailable(email);

    return this.repo.save(
      this.repo.create({
        name: dto.name.trim(),
        email,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateMerchandiserDto,
  ): Promise<MerchandiserEntity> {
    const merchandiser = await this.getById(id);

    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      if (email !== merchandiser.email) {
        await this.ensureEmailAvailable(email, id);
        merchandiser.email = email;
      }
    }
    if (dto.name !== undefined) merchandiser.name = dto.name.trim();
    if (dto.description !== undefined) {
      merchandiser.description = dto.description?.trim() || null;
    }
    if (dto.isActive !== undefined) merchandiser.isActive = dto.isActive;

    return this.repo.save(merchandiser);
  }

  private async ensureEmailAvailable(email: string, excludeId?: string) {
    const existing = await this.repo.findOne({ where: { email } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Email "${email}" already exists`);
    }
  }
}
