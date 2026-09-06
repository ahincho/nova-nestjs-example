import { novaVitestConfig } from '@ahincho/nova-nestjs-toolchain/vitest/index.mjs';

export default novaVitestConfig({
  // Un solo archivo de configuracion para las dos ubicaciones. Con Jest hacian
  // falta dos porque cada suite necesitaba su propio testRegex y su propia
  // transformacion; aca la unica diferencia entre un spec unitario y uno de
  // punta a punta es donde vive.
  include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  // El servicio de ejemplo no persigue el umbral de cobertura del preset: lo
  // que se prueba aca es la integracion con la plataforma, no cada rama.
  thresholds: false,
});
