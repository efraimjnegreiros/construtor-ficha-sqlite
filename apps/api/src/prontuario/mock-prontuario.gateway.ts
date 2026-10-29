import { Injectable } from '@nestjs/common';
import { ProntuarioGateway, type PacienteResumo, type ProntuarioStatus } from './prontuario.gateway';

// Dados 100% fictícios.
const PACIENTES: readonly PacienteResumo[] = [
  { id: 'pac-001', nome: 'Maria de Exemplo', dataNascimento: '1985-03-12', numeroProntuario: 'PRT-0001' },
  { id: 'pac-002', nome: 'João de Teste', dataNascimento: '1972-11-30', numeroProntuario: 'PRT-0002' },
  { id: 'pac-003', nome: 'Ana Fictícia', dataNascimento: '2001-07-04', numeroProntuario: 'PRT-0003' },
];

@Injectable()
export class MockProntuarioGateway extends ProntuarioGateway {
  async getStatus(): Promise<ProntuarioStatus> {
    return { available: true, mode: 'mock' };
  }

  async findPaciente(id: string): Promise<PacienteResumo | null> {
    return PACIENTES.find((paciente) => paciente.id === id) ?? null;
  }
}
