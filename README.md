# nova-nestjs-example

Servicio NestJS de referencia construido sobre el meta-framework
[Nova Platform](https://github.com/ahincho/nova-nestjs).

Existe para dos cosas: mostrar cómo se integra la plataforma en un proyecto
nuevo, y servir de canario — siempre corre contra la última versión publicada,
así que si un cambio del framework rompe algo, se ve acá primero.

## Arrancar

Los paquetes viven en GitHub Packages, que **pide autenticación incluso para un
paquete público**. La credencial va una sola vez en la configuración de usuario:

```bash
pnpm config set "//npm.pkg.github.com/:_authToken" "$(gh auth token)"
pnpm install
cp .env.example .env
pnpm start:dev
```

El token necesita `read:packages`. Si `gh` no lo tiene todavía:

```bash
gh auth refresh -h github.com -s read:packages
```

**La credencial no puede ir en el `.npmrc` de este repositorio.** pnpm se niega
a expandir una variable de entorno dentro de una credencial que viene de un
`.npmrc` versionado, y hace bien: alguien podría cambiar la URL del registry en
un pull request y llevarse el token. El archivo versionado sólo dice de dónde
salen los paquetes.

Un detalle más: `gh auth refresh` renueva el token del CLI, **no** el de
`~/.npmrc`. Hay que volver a correr el `pnpm config set` de arriba.

## Lo que hay que escribir

**`main.ts`, entero:**

```ts
import { bootstrap } from '@ahincho/nova-nestjs';
import { AppModule } from './app.module';

void bootstrap(AppModule, {
  globalPrefix: 'api/v1',
  legacyHealthPath: 'api/v1/health',
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

## Las sondas de salud

Corren sobre [`@nestjs/terminus`](https://docs.nestjs.com/recipes/terminus). Lo
que este servicio declara son tres cosas, y ninguna es el runner:

```ts
health: {
  legacyPath: 'api/v1/health',
  gracefulShutdownTimeoutMs: 5000,
  readinessChecks: [
    { name: 'academic', check: () => Boolean(process.env['ACADEMIC_URL']) },
  ],
}
```

| Ruta             | Qué contesta                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `/health/live`   | si el proceso está vivo, sin tocar ninguna dependencia           |
| `/health/ready`  | los chequeos, en el cuerpo estándar de terminus; 503 si uno cae  |
| `/api/v1/health` | la ruta heredada, igual que `ready`, para el target group de hoy |

**`legacyPath` es lo que permite migrar sin tocar la infraestructura.** Un
servicio que ya está desplegado tiene un target group apuntando a
`/api/v1/health`; moverlo es recrearlo. Sirviendo las dos en paralelo, la
infraestructura cambia después, y a su ritmo. Tiene que ir además en el
`legacyHealthPath` de `bootstrap()`, que es lo que la deja fuera del prefijo
global.

**`gracefulShutdownTimeoutMs` es la ventana del despliegue.** Tras SIGTERM el
proceso sigue vivo, pero `ready` y la ruta heredada pasan a 503 durante esos
cinco segundos: el balanceador saca la tarea de rotación antes de que el
proceso cierre. Sin esa ventana, las peticiones en vuelo del final de cada
despliegue mueren. Conviene mayor al intervalo de la sonda del target group y
menor al `stopTimeout` de la tarea.

Un chequeo de disponibilidad **no llama al upstream a propósito**. Si `ready`
cayera cuando `academic` se cae, el orquestador reiniciaría tareas sanas de este
servicio por un problema ajeno, y una caída de un upstream se convertiría en una
caída de todo lo que depende de él.

## Lo que se prueba en `test/app.e2e-spec.ts`

Catorce pruebas, y todas son de integración con la plataforma:

| Qué                                              | Por qué importa                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| El sobre envuelve lo que devuelve el controlador | es el contrato que consumen los frontends                        |
| Un DTO fallido vuelve con una entrada por campo  | el formulario necesita saber qué input resaltar                  |
| Un campo que ningún DTO declara se rechaza       | un campo ignorado en silencio hace creer que se aplicó un filtro |
| Un 500 del upstream sale como 502 sin el detalle | el status del upstream describe una topología ajena al cliente   |
| Un 404 que el cliente decidió traducir pasa      | `forwardError` es la salida explícita                            |
| Las sondas responden fuera de `/api/v1`          | mover la ruta es mover el target group                           |
| `ready` reporta cada chequeo por nombre          | un 503 sin decir cuál obliga a entrar al contenedor              |
| La ruta heredada contesta igual que `ready`      | es la que hoy decide si la tarea recibe tráfico                  |
| Un chequeo caído sale 503, no 200                | un flag en `false` dentro de un 200 el balanceador no lo mira    |
| `live` sigue arriba con `ready` caída            | reiniciar el contenedor no levanta al upstream                   |
| Las sondas no vienen envueltas                   | el balanceador revisa la **forma** del cuerpo                    |
| El id de correlación vuelve en la respuesta      | el llamador lo necesita para reportar una falla                  |
| El id viaja al upstream sin que nadie lo pase    | es el trabajo que la plataforma hace sola                        |

El upstream se reemplaza mockeando `fetch`, que es lo que el cliente HTTP del
framework usa por dentro.

```bash
pnpm test:e2e
```

El script llama a Jest a través de `node --experimental-vm-modules`, y el
`engines` pide Node 24.9. terminus 12 se publica sólo como ESM: Node lo carga
sin problema desde un CommonJS, pero Jest necesita esa bandera y esa versión
para hacerlo. Es la razón por la que este repositorio quedó en Node 24, y el
motivo por el que el runner está en revisión.

## Generar en vez de copiar

`@ahincho/nova-nestjs-schematics` viene como dependencia de desarrollo. Un upstream
nuevo son cuatro archivos que solo cambian de nombre entre uno y otro, y
copiarlos es como aparecen tres versiones distintas del cliente del mismo
servicio:

```bash
pnpm nest g -c @ahincho/nova-nestjs-schematics upstream schedules
# CREATE src/upstream/schedules/schedules.client.spec.ts
# CREATE src/upstream/schedules/schedules.client.ts
# CREATE src/upstream/schedules/schedules.config.ts
# CREATE src/upstream/schedules/schedules.module.ts
```

Un feature, en cualquiera de los dos layouts:

```bash
pnpm nest g -c @ahincho/nova-nestjs-schematics feature enrollments              # acl
pnpm nest g -c @ahincho/nova-nestjs-schematics feature courses --style bff
```

Lo generado compila, pasa el lint de la plataforma y trae sus propios tests
verdes.

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

`pnpm-workspace.yaml` excluye `@ahincho/nova-*` de la política de antigüedad
mínima de pnpm, que rechaza por defecto una versión publicada hace minutos. Esa
política protege de un mantenedor de un tercero comprometido; estos paquetes los
publica el mismo equipo desde un workflow que corre la suite antes de subir, y
sin la exclusión un parche no se podría probar el día que sale.

## Las versiones de NestJS, en un solo lugar

`package.json` no dice qué versión de NestJS usa: dice `catalog:`. Los rangos
viven en el bloque `catalog` de `pnpm-workspace.yaml`, uno por paquete.

```jsonc
// package.json
"@nestjs/common": "catalog:",
"@nestjs/core": "catalog:",
```

Repartidas entre `dependencies` y `devDependencies` era donde empezaba la
deriva: cada servicio que copiaba este layout elegía su propio parche y nadie
comparaba. Con el catálogo, subir NestJS es editar una línea.

**El catálogo llega hasta el borde del repositorio.** pnpm no tiene un `extends`
que lo traiga de un paquete publicado, así que dos servicios distintos siguen
teniendo cada uno el suyo. Lo que impide que se separen es otra cosa:

```yaml
# pnpm-workspace.yaml
strictPeerDependencies: true
```

`@ahincho/nova-nestjs` declara como peer contra qué NestJS está probada. Con esa
línea, no cumplirlo deja de ser una advertencia al final del install y pasa a
romperlo:

```
✕ unmet peer @nestjs/terminus
  Installed: 11.1.1
  Wanted:
    ^12.0.0:
      @ahincho/nova-nestjs@0.3.0
```

Un servicio no puede irse solo al siguiente major de NestJS, ni quedarse atrás
sin que nadie lo note. El día que la plataforma soporte el 12, lo dice su rango
de peer y los servicios lo siguen; hasta entonces, el install falla en la
máquina del desarrollador y no en producción.

**Esa línea sola no alcanza en CI**, y conviene saberlo. `strictPeerDependencies`
sólo salta en un install que resuelve; `pnpm install --frozen-lockfile`, que es
lo que corre el pipeline, reusa el lockfile tal cual y da por bueno lo que ya
está resuelto. Medido:

| Comando                          | Con un peer fuera de rango |
| -------------------------------- | -------------------------- |
| `pnpm install`                   | falla                      |
| `pnpm install --frozen-lockfile` | pasa                       |
| `pnpm peers check`               | falla                      |

Por eso el pipeline tiene un paso `Peers` que lo pide explícitamente. Sin él, un
lockfile con una violación adentro entra al repositorio sin que nada la nombre.

## Variables

| Variable               | Obligatoria | Para qué                                          |
| ---------------------- | ----------- | ------------------------------------------------- |
| `PORT`                 | no, 3000    | puerto que escucha                                |
| `CORS_ALLOWED_ORIGINS` | no          | lista separada por coma; vacía no permite ninguno |
| `ACADEMIC_URL`         | **sí**      | upstream; sin ella el servicio no arranca         |
| `ACADEMIC_TIMEOUT_MS`  | no, 3000    | timeout de ese upstream                           |

`ACADEMIC_URL` es obligatoria a propósito: un servicio al que nunca le
inyectaron la URL muere al arrancar nombrando la variable, en vez de responder
500 la primera vez que alguien llame esa ruta.
