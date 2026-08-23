/**
 * Tests for the deploy/uptime probes  (T15)
 *
 * The point of these is the failure path. A readiness probe that only ever
 * gets exercised against a healthy database is exactly the class of
 * "written but never validated" code this project exists to fix — it would
 * report 200 forever, including while the API was unable to serve a single
 * request. So the case that matters here is: Prisma throws, and the route
 * still answers with a 503 and a machine-readable reason rather than
 * propagating a 500.
 */
import { HealthController } from './health.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { Response } from 'express';

function fakeResponse() {
  const res = { statusCode: 200, status(code: number) { res.statusCode = code; return res; } };
  return res as unknown as Response & { statusCode: number };
}

describe('HealthController', () => {
  describe('GET /health (liveness)', () => {
    it('reports ok without touching the database', () => {
      // Prisma deliberately throws: liveness must never depend on the DB,
      // or a DB outage takes the process down in the platform's eyes.
      const prisma = { $queryRaw: () => { throw new Error('should not be called'); } };
      const body = new HealthController(prisma as unknown as PrismaService).live();

      expect(body.status).toBe('ok');
      expect(typeof body.uptime).toBe('number');
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    });
  });

  describe('GET /health/ready (readiness)', () => {
    it('reports the database up and leaves the status at 200', async () => {
      const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
      const res = fakeResponse();

      const body = await new HealthController(prisma as unknown as PrismaService).ready(res);

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.database.status).toBe('up');
    });

    it('answers 503 with the Prisma code when the database is unreachable', async () => {
      // P1001 is what Prisma raises when it cannot reach the database host —
      // verified live against a stopped Postgres container.
      const prisma = { $queryRaw: jest.fn().mockRejectedValue(Object.assign(new Error('reach'), { code: 'P1001' })) };
      const res = fakeResponse();

      const body = await new HealthController(prisma as unknown as PrismaService).ready(res);

      expect(res.statusCode).toBe(503);
      expect(body.status).toBe('error');
      expect(body.database.status).toBe('down');
      expect(body.database.code).toBe('P1001');
    });

    it('does not leak the driver error message, which can contain the DB host', async () => {
      const prisma = {
        $queryRaw: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.7:5433 user=glow password=hunter2')),
      };
      const res = fakeResponse();

      const body = await new HealthController(prisma as unknown as PrismaService).ready(res);

      expect(res.statusCode).toBe(503);
      expect(body.database.code).toBe('UNKNOWN');
      expect(JSON.stringify(body)).not.toContain('10.0.0.7');
      expect(JSON.stringify(body)).not.toContain('hunter2');
    });
  });
});
