import { Controller, Get, Header, Post } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { MlService } from '../ml/ml.service';
import { LlmService } from '../agent/llm.service';
import { RatePolicy } from '../security/rate-policy';
@Controller('services')
export class ServicesController {
  constructor(private readonly db: DbService, private readonly ml: MlService, private readonly llm: LlmService) {}
  @Get() @Header('Cache-Control', 'no-store')
  async services() {
    const [database, ml] = await Promise.allSettled([this.db.q('SELECT 1 AS ready'), this.ml.meta() as Promise<unknown>]);
    const mlValue = ml.status === 'fulfilled' ? ml.value : null;
    return { checkedAt: Date.now(), database: { ok: database.status === 'fulfilled' }, ml: { ok: !!mlValue && typeof mlValue === 'object' && !('error' in mlValue) }, llm: this.llm.status() };
  }
  @Post('llm/check')
  @RatePolicy('probe')
  checkLlm() { return this.llm.probe(); }
}
