// =============================================================================
// REGRA DE OURO: o construtor de fichas é SUBORDINADO ao prontuário.
// -----------------------------------------------------------------------------
// Consequências arquiteturais:
//   1. O prontuário é a fonte de verdade de pacientes e atendimentos. O
//      construtor nunca guarda nem duplica esses dados; só os consulta por
//      esta porta (ProntuarioGateway).
//   2. O construtor não opera sem o prontuário: as rotas do construtor passam
//      pelo ProntuarioSubordinationGuard, que responde 503 se o prontuário
//      estiver indisponível.
//   3. A dependência é de mão única: o prontuário não importa nada do
//      construtor.
//
// Hoje só existe MockProntuarioGateway. A integração real implementa esta mesma
// classe abstrata e é trocada em ProntuarioModule.
// =============================================================================

export interface ProntuarioStatus {
  available: boolean;
  /** 'mock' enquanto não houver integração real. */
  mode: 'mock' | 'live';
}

export interface PacienteResumo {
  id: string;
  nome: string;
  dataNascimento: string;
  numeroProntuario: string;
}

export abstract class ProntuarioGateway {
  abstract getStatus(): Promise<ProntuarioStatus>;
  abstract findPaciente(id: string): Promise<PacienteResumo | null>;
}
