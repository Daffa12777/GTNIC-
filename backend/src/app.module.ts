import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AgentService } from './agent/agent.service';
import { CaseStore } from './agent/case.store';
import { LlmService } from './agent/llm.service';
import { ApiController } from './api/api.controller';
import { DbModule } from './db/db.module';
import { MlService } from './ml/ml.service';
import { MonitorService } from './monitor/monitor.service';
import { StatusStore } from './monitor/status.store';
import { RagService } from './rag/rag.service';
import { SimService } from './sim/sim.service';
import { ToolsService } from './tools/tools.service';
import { NotificationDispatcher } from './tools/notification-dispatcher.service';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [ApiController],
  providers: [MlService, SimService, RagService, ToolsService, NotificationDispatcher, CaseStore, LlmService, StatusStore, AgentService, MonitorService],
})
export class AppModule {}
