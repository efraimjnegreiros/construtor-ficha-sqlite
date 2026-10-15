import { Module } from '@nestjs/common';
import { FormAccessModule } from '../form-access/form-access.module';
import { MockProntuarioGateway } from './mock-prontuario.gateway';
import { ProntuarioController } from './prontuario.controller';
import { ProntuarioGateway } from './prontuario.gateway';
import { ProntuarioSubordinationGuard } from './prontuario-subordination.guard';

@Module({
  imports: [FormAccessModule],
  controllers: [ProntuarioController],
  providers: [{ provide: ProntuarioGateway, useClass: MockProntuarioGateway }, ProntuarioSubordinationGuard],
  exports: [ProntuarioGateway, ProntuarioSubordinationGuard],
})
export class ProntuarioModule {}
