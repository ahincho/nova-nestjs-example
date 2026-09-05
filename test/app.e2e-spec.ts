import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { validationExceptionFactory } from '@ahincho/nova-nestjs';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

/**
 * Lo que prueba esta suite es la integración con la plataforma: que el sobre
 * envuelve, que un DTO fallido vuelve con una entrada por campo, que las sondas
 * quedan fuera del prefijo global y que el id de correlación vuelve.
 *
 * El upstream se reemplaza mockeando `fetch`, que es lo que usa el cliente HTTP
 * del framework por dentro.
 */

/** El sobre estándar, para tipar lo que devuelve supertest. */
type Envelope<T> = {
  success: boolean;
  status: number;
  data: T;
  errors: { code: string; message: string; field: string | null }[];
};

/** El cuerpo de terminus con el que responden las sondas. */
type HealthEntry = {
  status: string;
  message?: string;
  /** Lo que tardó el chequeo. Lo agrega el `withTimeout` de terminus. */
  responseTime?: number;
};

type HealthBody = {
  status: string;
  info: Record<string, HealthEntry>;
  error: Record<string, HealthEntry>;
  details: Record<string, HealthEntry>;
};

/**
 * `res.body` de supertest es `any`, y un `any` que entra a un `expect` apaga el
 * chequeo de tipos de toda la aserción. La conversión se hace una sola vez acá.
 */
function bodyOf<T>(response: { body: unknown }): T {
  return response.body as T;
}

/** Los argumentos de `fetch`, para tipar el mock y sus llamadas registradas. */
type FetchArgs = [input: string, init?: RequestInit];

describe('the example service', () => {
  let app: INestApplication<App>;
  let fetchMock: jest.Mock<Promise<Response>, FetchArgs>;

  beforeAll(async () => {
    process.env['ACADEMIC_URL'] = 'http://academic.test';
    process.env['ACADEMIC_TIMEOUT_MS'] = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // El mismo pipe que instala bootstrap(). Acá se pone a mano porque el test
    // construye la aplicación con el harness de Nest y no con bootstrap().
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    // La ruta heredada va en la lista junto a las sondas nuevas: sin eso queda
    // servida en `/api/v1/api/v1/health` y el target group deja de encontrarla.
    app.setGlobalPrefix('api/v1', {
      exclude: ['health/live', 'health/ready', 'api/v1/health'],
    });

    await app.init();
  });

  beforeEach(() => {
    fetchMock = jest.fn<Promise<Response>, FetchArgs>();
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

  describe('the response envelope', () => {
    it('wraps what the controller returns', async () => {
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

  describe('validation', () => {
    it('returns one entry per constraint, with its field', async () => {
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

    it('rejects a field no DTO declares', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ periodId: 2026, unknownFilter: 'x' })
        .expect(400);

      expect(bodyOf<Envelope<null>>(response).success).toBe(false);
    });
  });

  describe('an upstream error', () => {
    // El status propio del upstream describe una topología que el cliente no
    // debería aprender de un cuerpo de error.
    it('comes out as 502 without leaking the detail', async () => {
      fetchMock.mockResolvedValue(
        json({ detail: 'connection to academic-db refused' }, 500),
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ periodId: 2026 })
        .expect(502);

      expect(bodyOf<Envelope<null>>(response).errors[0]?.code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
      expect(JSON.stringify(response.body)).not.toContain('academic-db');
    });

    // Y el caso donde el cliente sí pidió el error crudo para mapearlo.
    it('lets through a 404 the caller chose to translate', async () => {
      fetchMock.mockResolvedValue(json({ code: 'NOT_FOUND' }, 404));

      const response = await request(app.getHttpServer())
        .get('/api/v1/courses/MAT999')
        .expect(404);

      expect(bodyOf<Envelope<null>>(response).errors[0]).toEqual({
        code: 'NOT_FOUND',
        message: 'Curso MAT999 no encontrado',
        field: null,
      });
    });
  });

  describe('the health probes', () => {
    // Quedan fuera del prefijo global: moverlas es mover el target group.
    it('answer outside the global prefix', async () => {
      await request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect({ status: 'ok', info: {}, error: {}, details: {} });

      await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
    });

    it('reports every readiness check by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      // `responseTime` lo pone terminus por cada chequeo con fecha límite; se
      // afirma su presencia para que un cambio de forma del cuerpo no pase.
      const up = { status: 'up', responseTime: expect.any(Number) as number };
      expect(bodyOf<HealthBody>(response)).toEqual({
        status: 'ok',
        info: { academic: up },
        error: {},
        details: { academic: up },
      });
    });

    // La ruta que el target group ya revisa, servida en paralelo mientras la
    // infraestructura sigue apuntando ahí.
    it('answers the legacy route with the same body as ready', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(bodyOf<HealthBody>(response).details).toEqual({
        academic: { status: 'up', responseTime: expect.any(Number) as number },
      });
    });

    // Lo que decide si la tarea recibe tráfico. Un chequeo caído tiene que ser
    // un 503: un 200 con un campo en `false` adentro el balanceador no lo mira.
    it('answers 503 when a check fails, naming which one', async () => {
      const url = process.env['ACADEMIC_URL'];
      delete process.env['ACADEMIC_URL'];

      try {
        const response = await request(app.getHttpServer())
          .get('/health/ready')
          .expect(503);

        const body = bodyOf<HealthBody>(response);
        expect(body.status).toBe('error');
        expect(body.error['academic']?.status).toBe('down');
      } finally {
        process.env['ACADEMIC_URL'] = url;
      }
    });

    // La sonda de vida no toca ninguna dependencia: si cayera con el upstream,
    // el orquestador reiniciaría el contenedor, y eso no levanta al upstream.
    it('keeps liveness up while readiness is down', async () => {
      const url = process.env['ACADEMIC_URL'];
      delete process.env['ACADEMIC_URL'];

      try {
        await request(app.getHttpServer()).get('/health/ready').expect(503);
        await request(app.getHttpServer()).get('/health/live').expect(200);
      } finally {
        process.env['ACADEMIC_URL'] = url;
      }
    });

    // Sin el sobre: el balanceador revisa la forma del cuerpo.
    it('are exempt from the response envelope', async () => {
      const response = await request(app.getHttpServer()).get('/health/live');

      expect(response.body).not.toHaveProperty('data');
    });
  });

  describe('the correlation id', () => {
    it('comes back as the one the caller sent', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/courses/debug/context')
        .set('x-request-id', 'req-de-prueba')
        .expect(200);

      expect(response.headers['x-request-id']).toBe('req-de-prueba');
      expect(bodyOf<Envelope<{ requestId: string }>>(response).data).toEqual({
        requestId: 'req-de-prueba',
      });
    });

    it('is generated when the caller sent none', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/courses/debug/context')
        .expect(200);

      expect(response.headers['x-request-id']).toEqual(expect.any(String));
    });

    // Lo que nadie escribe en el código: el id sale hacia el upstream solo.
    it('travels to the upstream with no call site passing it', async () => {
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
