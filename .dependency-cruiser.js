/**
 * Reglas de arquitectura del BFF, verificadas en CI con `nova lint:arch`.
 * Equivalente a ArchUnit en Java.
 *
 * El `name` de cada regla va en inglés porque es un identificador: aparece en
 * la salida, y es la clave con la que un baseline de `--ignore-known` la
 * referencia. El `comment` va en español porque lo lee una persona cuando la
 * regla salta.
 *
 * **Las reglas son genéricas.** Los comodines aplican a cualquier feature o
 * upstream que se agregue sin tocar este archivo. Enumerarlos a mano es como
 * una regla se queda vieja sin que nadie lo note: sigue en verde, pero ya no
 * mira lo que se agregó después.
 */
module.exports = {
  forbidden: [
    {
      name: 'upstream-must-not-import-features',
      severity: 'error',
      comment:
        'Un upstream sólo sabe hablar con SU servicio. Si necesita algo de un feature, la dependencia está al revés.',
      from: { path: '^src/upstream/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'upstream-must-not-import-another-upstream',
      severity: 'error',
      comment:
        'Si un upstream llama a otro, se acopla y deja de ser reusable. Juntar dos fuentes es trabajo del feature.',
      from: { path: '^src/upstream/([^/]+)/' },
      to: { path: '^src/upstream/', pathNot: '^src/upstream/$1/' },
    },
    {
      name: 'feature-must-not-import-another-feature',
      severity: 'error',
      comment:
        'Cada pantalla es independiente. Si dos comparten algo, ese algo baja a un upstream o sube a la plataforma.',
      // Un solo segmento: el feature es `src/features/<nombre>/`. Capturar dos
      // hacia que la regla leyera `src/features/courses/port/` como un feature
      // distinto de `src/features/courses/dto/`, y un feature no podía importar
      // sus propios archivos.
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'feature-uses-only-the-upstream-port',
      severity: 'error',
      comment:
        'El feature depende de la interfaz, nunca del adapter HTTP ni del mapper. Si no, no se puede mockear ni cambiar la fuente.',
      from: { path: '^src/features/' },
      // `[.]` en vez de un backslash escapado, por el mismo motivo que abajo.
      to: { path: '^src/upstream/[^/]+/.+[.](http|mapper)[.]ts$' },
    },
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    // `[.]` en vez de un backslash escapado: significan lo mismo y una clase de
    // carácter no se puede perder al pasar por una plantilla ni por un editor.
    // Con el escape mal puesto la expresión queda como `.`, que acepta
    // cualquier carácter, y nada avisa.
    exclude: { path: '[.]spec[.]ts$' },
  },
};
