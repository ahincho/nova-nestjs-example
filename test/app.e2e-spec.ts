import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { validationExceptionFactory } from '@ahincho/nova-nestjs';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

/**
 * Lo que prueba esta suite es la integracion con la plataforma: que el sobre
 * envuelve, que un DTO fallido vuelve con una entrada por campo, que las sondas
 * quedan fuera del prefijo global y que el id de correlacion vuelve.
 *
 * El upstream se reemplaza mockeando `fetch`, que es lo que usa el cliente HTTP
 * del framework por dentro.
 */
describe('el servicio de ejemplo', () => {
  let app: INestApplication<App>;
  let fetchMock: jest.Mock;

  beforeAll(async () => {
    process.env['ACADEMIC_URL'] = 'http://academic.test';
    process.env['ACADEMIC_TIMEOUT_MS'] = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // El mismo pipe que instala bootstrap(). Aca se pone a mano porque el test
    // construye la aplicacion con el harness de Nest y no con bootstrap().
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['health/live', 'health/ready'],
    });

    await app.init();
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(async () => {
    await app.close();
  });

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  describe('el sobre de respuesta', () => {
    it('envuelve lo que devuelve el controlador', async () => {
      fetchMock.mockResolvedValue(
        json([{ id: 'MAT101', name: 'Calculo I', credits: 4 }]),
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ periodId: 2026 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        status: 200,
        data: [{ id: 'MAT101', name: 'Calculo I', credits: 4 }],
        errors: [],
      });
    });
  });

  describe('la validacion', () => {
    it('devuelve una entrada por restriccion, con su campo', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ periodId: 1999 })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        status: 400,
        data: null,
        errors: [
          {
            code: 'VALIDATION_ERROR',
            message: 'periodId no puede ser anterior a 2000',
            field: 'periodId',
          },
        ],
      });
    });

    it('rechaza un campo que ningun DTO declara', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ periodId: 2026, unknownFilter: 'x' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('el error del upstream', () => {
    // El status propio del upstream describe una topologia que el cliente no
    // deberia aprender de un cuerpo de error.
    it('sale como 502 sin filtrar el detalle', async () => {
      fetchMock.mockResolvedValue(
        json({ detail: 'connection to academic-db refused' }, 500),
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ periodId: 2026 })
        .expect(502);

      expect(response.body.errors[0].code).toBe('INTERNAL_SERVER_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('academic-db');
    });

    // Y el caso donde el cliente si pidio el error crudo para mapearlo.
    it('deja pasar un 404 que el cliente decidio traducir', async () => {
      fetchMock.mockResolvedValue(json({ code: 'NOT_FOUND' }, 404));

      const response = await request(app.getHttpServer())
        .get('/api/v1/courses/MAT999')
        .expect(404);

      expect(response.body.errors[0]).toEqual({
        code: 'NOT_FOUND',
        message: 'Curso MAT999 no encontrado',
        field: null,
      });
    });
  });

  describe('las sondas de salud', () => {
    // Quedan fuera del prefijo global: moverlas es mover el target group.
    it('responden fuera de /api/v1', async () => {
      await request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect({ status: 'ok' });

      await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(404);
    });

    it('reportan cada chequeo de disponibilidad por nombre', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        checks: { academic: true },
      });
    });

    // Sin el sobre: el balanceador revisa la forma del cuerpo.
    it('no vienen envueltas', async () => {
      const response = await request(app.getHttpServer()).get('/health/live');

      expect(response.body).not.toHaveProperty('data');
    });
  });

  describe('el id de correlacion', () => {
    it('vuelve en la respuesta y es el que mando el llamador', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/courses/debug/context')
        .set('x-request-id', 'req-de-prueba')
        .expect(200);

      expect(response.headers['x-request-id']).toBe('req-de-prueba');
      expect(response.body.data).toEqual({ requestId: 'req-de-prueba' });
    });

    it('se genera cuando el llamador no lo mando', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/courses/debug/context')
        .expect(200);

      expect(response.headers['x-request-id']).toEqual(expect.any(String));
    });

    // Lo que nadie escribe en el codigo: el id sale hacia el upstream solo.
    it('viaja hacia el upstream sin que el cliente lo pase', async () => {
      fetchMock.mockResolvedValue(json([]));

      await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ periodId: 2026 })
        .set('x-request-id', 'req-propagado')
        .set('x-user-id', 'u-42')
        .expect(200);

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<
        string,
        string
      >;
      expect(headers['x-request-id']).toBe('req-propagado');
      expect(headers['x-user-id']).toBe('u-42');
    });
  });
});
