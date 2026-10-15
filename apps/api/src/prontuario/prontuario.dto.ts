import { ApiProperty } from '@nestjs/swagger';

export class ProntuarioStatusDto {
  @ApiProperty({ example: true })
  available!: boolean;

  @ApiProperty({ enum: ['mock', 'live'], example: 'mock' })
  mode!: 'mock' | 'live';
}

export class PacienteResumoDto {
  @ApiProperty({ example: 'pac-001' })
  id!: string;

  @ApiProperty({ example: 'Maria de Exemplo' })
  nome!: string;

  @ApiProperty({ example: '1985-03-12', description: 'Data de nascimento (YYYY-MM-DD)' })
  dataNascimento!: string;

  @ApiProperty({ example: 'PRT-0001' })
  numeroProntuario!: string;
}
