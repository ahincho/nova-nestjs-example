import { Module } from '@nestjs/common';
import { AcademicModule } from '../upstream/academic/academic.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [AcademicModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
