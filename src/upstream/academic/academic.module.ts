import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcademicClient } from './academic.client';
import { academic } from './academic.config';

@Module({
  imports: [ConfigModule.forFeature(academic)],
  providers: [AcademicClient],
  exports: [AcademicClient],
})
export class AcademicModule {}
