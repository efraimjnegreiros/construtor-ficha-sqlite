import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MockProntuarioGateway } from './mock-prontuario.gateway';
import { ProntuarioGateway } from './prontuario.gateway';
import { ProntuarioSubordinationGuard } from './prontuario-subordination.guard';

function gatewayWith(getStatus: ProntuarioGateway['getStatus']): ProntuarioGateway {
  return { getStatus, findPaciente: async () => null };
}

describe('ProntuarioSubordinationGuard (regra de ouro)', () => {
  it('allows when the prontuário is available', async () => {
    const guard = new ProntuarioSubordinationGuard(new MockProntuarioGateway());
    expect(await guard.canActivate()).toBe(true);
  });

  it('blocks with 503 when the prontuário reports unavailable', async () => {
    const guard = new ProntuarioSubordinationGuard(
      gatewayWith(async () => ({ available: false, mode: 'live' })),
    );
    await expect(guard.canActivate()).rejects.toThrow(ServiceUnavailableException);
  });

  it('blocks with 503 when the status check itself fails', async () => {
    const guard = new ProntuarioSubordinationGuard(
      gatewayWith(async () => {
        throw new Error('timeout');
      }),
    );
    await expect(guard.canActivate()).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('MockProntuarioGateway', () => {
  const gateway = new MockProntuarioGateway();

  it('reports itself as available in mock mode', async () => {
    expect(await gateway.getStatus()).toEqual({ available: true, mode: 'mock' });
  });

  it('finds a known paciente and returns null for unknown ones', async () => {
    expect((await gateway.findPaciente('pac-001'))?.numeroProntuario).toBe('PRT-0001');
    expect(await gateway.findPaciente('nao-existe')).toBeNull();
  });
});
