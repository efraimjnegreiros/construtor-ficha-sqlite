import { Module } from '@nestjs/common';
import { FormAccessModule } from '../form-access/form-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProntuarioModule } from '../prontuario/prontuario.module';
import { FormStructureController } from './form-structure.controller';
import { FormStructureService } from './form-structure.service';

@Module({
  imports: [PrismaModule, FormAccessModule, ProntuarioModule],
  controllers: [FormStructureController],
  providers: [FormStructureService],
  exports: [FormStructureService],
})
export class FormStructureModule {}
