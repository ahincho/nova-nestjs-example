# nova-nestjs-example

Servicio NestJS de referencia construido sobre el meta-framework
[Nova Platform](https://github.com/ahincho/nova-nestjs).

Existe para dos cosas: mostrar cómo se integra la plataforma en un proyecto
nuevo, y servir de canario — siempre corre contra la última versión publicada,
así que si un cambio del framework rompe algo, se ve acá primero.

## Arrancar

Los paquetes viven en GitHub Packages, que **pide autenticación incluso para un
paquete público**. Hace falta un token con `read:packages`:

```bash
export GITHUB_PACKAGES_TOKEN=<token con read:packages>
pnpm install
cp .env.example .env
pnpm start:dev
```

El token se lee de la variable y no se guarda en el repositorio; `.npmrc` sólo
declara de dónde salen los paquetes.

## Lo que hay que escribir

**`main.ts`, entero:**

```ts
import { bootstrap } from '@ahincho/nova-nestjs';
import { AppModule } from './app.module';

void bootstrap(AppModule, {
  globalPrefix: 'api/v1',
  cors: { origins: process.env['CORS_ALLOWED_ORIGINS'] ?? '' },
});
```

**Un upstream, entero:**

```ts
export const academic = defineUpstream('academic', { defaultTimeoutMs: 3000 });
// lee ACADEMIC_URL y ACADEMIC_TIMEOUT_MS
```

**Un controlador** devuelve su objeto de dominio; el sobre lo pone el
interceptor global:

```ts
@Get()
list(@Query() query: ListCoursesQuery): Promise<CourseResponse[]> {
  return this.courses.list(query);
}
```

No hay `src/common` ni `src/core`. Los quince archivos que cada servicio copiaba
son ahora una dependencia.

## Lo que se prueba en `test/app.e2e-spec.ts`

Once pruebas, y todas son de integración con la plataforma:

| Qué | Por qué importa |
|---|---|
| El sobre envuelve lo que devuelve el controlador | es el contrato que consumen los frontends |
| Un DTO fallido vuelve con una entrada por campo | el formulario necesita saber qué input resaltar |
| Un campo que ningún DTO declara se rechaza | un campo ignorado en silencio hace creer que se aplicó un filtro |
| Un 500 del upstream sale como 502 sin el detalle | el status del upstream describe una topología ajena al cliente |
| Un 404 que el cliente decidió traducir pasa | `forwardError` es la salida explícita |
| Las sondas responden fuera de `/api/v1` | mover la ruta es mover el target group |
| Las sondas no vienen envueltas | el balanceador revisa la **forma** del cuerpo |
| El id de correlación vuelve en la respuesta | el llamador lo necesita para reportar una falla |
| El id viaja al upstream sin que nadie lo pase | es el trabajo que la plataforma hace sola |

El upstream se reemplaza mockeando `fetch`, que es lo que el cliente HTTP del
framework usa por dentro.

```bash
pnpm test:e2e
```

## Cómo se actualiza

Igual que cualquier dependencia:

```bash
pnpm update @ahincho/nova-nestjs
```

Cuando el framework publicó `0.1.1` —el middleware pasó a escribir el id de
correlación en `req.id`, que es lo que lee el filtro de excepciones— la
corrección llegó acá con ese comando. Antes del bump el log de un 5xx decía
`requestId: undefined`; después, el id.

Ese es el punto entero: la plataforma se actualiza con un número de versión, no
copiando archivos de un template.

## Variables

| Variable | Obligatoria | Para qué |
|---|---|---|
| `PORT` | no, 3000 | puerto que escucha |
| `CORS_ALLOWED_ORIGINS` | no | lista separada por coma; vacía no permite ninguno |
| `ACADEMIC_URL` | **sí** | upstream; sin ella el servicio no arranca |
| `ACADEMIC_TIMEOUT_MS` | no, 3000 | timeout de ese upstream |

`ACADEMIC_URL` es obligatoria a propósito: un servicio al que nunca le
inyectaron la URL muere al arrancar nombrando la variable, en vez de responder
500 la primera vez que alguien llame esa ruta.
