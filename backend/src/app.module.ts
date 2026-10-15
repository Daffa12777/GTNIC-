import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AgentService } from './agent/agent.service';
import { CaseStore } from './agent/case.store';
import { LlmService } from './agent/llm.service';
import { ApiController } from './api/api.controller';
import { DbService } from './db/db.service';
import { MlService } from './ml/ml.service';
import { MonitorService } from './monitor/monitor.service';
import { StatusStore } from './monitor/status.store';
import { RagService } from './rag/rag.service';
import { SimService } from './sim/sim.service';
import { ToolsService } from './tools/tools.service';

@Module({
  imports: [AuthModule],
  controllers: [ApiController],
  providers: [DbService, MlService, SimService, RagService, ToolsService, CaseStore, LlmService, StatusStore, AgentService, MonitorService],
})
export class AppModule {}
