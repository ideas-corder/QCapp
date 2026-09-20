import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SupplierEntity } from '../database/entities/supplier.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { parseCsv, pick, toBool, toNumber } from '../common/csv';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    private readonly dataSource: DataSource,
  ) {}

  list() {
    return this.supplierRepo.find({ order: { vendorId: 'ASC' } });
  }

  async getById(id: string): Promise<SupplierEntity> {
    const s = await this.supplierRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async create(dto: CreateSupplierDto): Promise<SupplierEntity> {
    const existingByName = await this.supplierRepo.findOne({
      where: { name: dto.name },
    });
    if (existingByName) throw new ConflictException('Supplier name already exists');

    const existingByVendor = await this.supplierRepo.findOne({
      where: { vendorId: dto.vendorId },
    });
    if (existingByVendor)
      throw new ConflictException(`Vendor ID ${dto.vendorId} already exists`);

    const supplier = this.supplierRepo.create({
      vendorId: dto.vendorId,
      name: dto.name,
      requireDoubleInspection: dto.requireDoubleInspection ?? false,
      autoDebitNoteLimit: String(dto.autoDebitNoteLimit ?? 0),
      notes: dto.notes ?? null,
    });
    return this.supplierRepo.save(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierEntity> {
    const s = await this.getById(id);

    if (dto.vendorId !== undefined && dto.vendorId !== s.vendorId) {
      const clash = await this.supplierRepo.findOne({
        where: { vendorId: dto.vendorId },
      });
      if (clash && clash.id !== s.id)
        throw new ConflictException(`Vendor ID ${dto.vendorId} already exists`);
      s.vendorId = dto.vendorId;
    }
    if (dto.name !== undefined) s.name = dto.name;
    if (dto.requireDoubleInspection !== undefined)
      s.requireDoubleInspection = dto.requireDoubleInspection;
    if (dto.autoDebitNoteLimit !== undefined)
      s.autoDebitNoteLimit = String(dto.autoDebitNoteLimit);
    if (dto.notes !== undefined) s.notes = dto.notes;
    return this.supplierRepo.save(s);
  }

  /**
   * Bulk-import suppliers from CSV.
   * Columns (case/space-insensitive):
   *   vendorId* (VEN-XXXXXX format, e.g. VEN-005036),
   *   name*, requireDoubleInspection (true/false, default false),
   *   autoDebitNoteLimit (number, default 0),
   *   notes (optional)
   */
  async bulkImport(
    csv: string,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const { rows } = parseCsv(csv);
    const errors: { row: number; message: string }[] = [];
    const toCreate: { row: number; dto: CreateSupplierDto }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const vendorId = (pick(row, 'vendorId', 'vendor_id', 'vendor') || '').trim().toUpperCase();
      const name = pick(row, 'name', 'supplier');
      if (!vendorId) {
        errors.push({ row: rowNum, message: 'Missing vendorId (format VEN-XXXXXX)' });
        return;
      }
      if (!/^VEN-\d{6}$/.test(vendorId)) {
        errors.push({ row: rowNum, message: `vendorId must match VEN-XXXXXX (got "${vendorId}")` });
        return;
      }
      if (!name) {
        errors.push({ row: rowNum, message: 'Missing name' });
        return;
      }
      const doubleRaw = pick(row, 'requireDoubleInspection', 'doubleInspection');
      const double = doubleRaw ? toBool(doubleRaw) : null;
      if (doubleRaw && double === null) {
        errors.push({ row: rowNum, message: `requireDoubleInspection must be true/false (got "${doubleRaw}")` });
        return;
      }
      const limitRaw = pick(row, 'autoDebitNoteLimit', 'debitLimit');
      const limit = limitRaw ? toNumber(limitRaw) : null;
      if (limitRaw && limit === null) {
        errors.push({ row: rowNum, message: `autoDebitNoteLimit must be a number (got "${limitRaw}")` });
        return;
      }
      toCreate.push({
        row: rowNum,
        dto: {
          vendorId,
          name,
          requireDoubleInspection: double ?? false,
          autoDebitNoteLimit: limit ?? 0,
          notes: pick(row, 'notes') || undefined,
        },
      });
    });

    if (toCreate.length === 0) return { created: 0, errors };

    let created = 0;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SupplierEntity);
      for (const { row, dto } of toCreate) {
        const existingByName = await repo.findOne({ where: { name: dto.name } });
        if (existingByName) {
          errors.push({ row, message: `Duplicate name "${dto.name}" — skipped` });
          continue;
        }
        const existingByVendor = await repo.findOne({ where: { vendorId: dto.vendorId } });
        if (existingByVendor) {
          errors.push({ row, message: `Duplicate vendorId "${dto.vendorId}" — skipped` });
          continue;
        }
        await repo.save(
          repo.create({
            vendorId: dto.vendorId,
            name: dto.name,
            requireDoubleInspection: dto.requireDoubleInspection,
            autoDebitNoteLimit: String(dto.autoDebitNoteLimit),
            notes: dto.notes ?? null,
          }),
        );
        created++;
      }
    });

    return { created, errors };
  }
}
