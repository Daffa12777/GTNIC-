import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AdjustStockDto, CreatePartDto } from './inventory.dto';
@Injectable()
export class InventoryService {
  constructor(private readonly db: DbService) {}
  async create(data: CreatePartDto) {
    try { return await this.db.client.inventory.create({ data }); }
    catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('ID part sudah digunakan.');
      throw error;
    }
  }
  async adjust(partId: string, data: AdjustStockDto, actor: string) {
    if (!data.delta) throw new BadRequestException('Perubahan stok tidak boleh nol.');
    return this.db.transaction(async () => {
      await this.db.q('SELECT part_id FROM inventory WHERE part_id=$1 FOR UPDATE', [partId]);
      const old = await this.db.client.stockMovement.findUnique({ where: { id: data.operationId } });
      if (old) {
        if (old.partId !== partId || old.delta !== data.delta || old.reason !== data.reason || old.actor !== actor) throw new ConflictException('ID transaksi sudah digunakan untuk perubahan lain.');
        return old;
      }
      const part = await this.db.client.inventory.findUnique({ where: { part_id: partId } });
      if (!part) throw new NotFoundException('Part tidak ditemukan.');
      if (part.stock !== data.expectedStock) throw new ConflictException('Stok sudah berubah. Muat ulang sebelum menyimpan.');
      const balance = (part.stock ?? 0) + data.delta;
      if (balance < 0 || balance > 1000000) throw new BadRequestException('Stok harus berada antara 0 dan 1.000.000.');
      await this.db.client.inventory.update({ where: { part_id: partId }, data: { stock: balance } });
      return this.db.client.stockMovement.create({ data: { id: data.operationId, partId, delta: data.delta, balance, reason: data.reason, actor } });
    });
  }
  history(partId: string) { return this.db.client.stockMovement.findMany({ where: { partId }, orderBy: { createdAt: 'desc' }, take: 20 }); }
}
