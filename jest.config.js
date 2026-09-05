module.exports = {
  preset: '@ahincho/nova-toolchain/jest',
  setupFiles: ['reflect-metadata'],
  // El servicio de ejemplo no persigue el umbral de cobertura del preset: lo
  // que se prueba aca es la integracion con la plataforma, no cada rama.
  coverageThreshold: undefined,
};
