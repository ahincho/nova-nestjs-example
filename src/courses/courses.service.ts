import { Injectable } from '@nestjs/common';
import { AcademicClient, type AcademicCourse } from '../upstream/academic/academic.client';
import type { CourseResponse } from './dto/course.response';
import type { ListCoursesQuery } from './dto/list-courses.query';

@Injectable()
export class CoursesService {
  constructor(private readonly academic: AcademicClient) {}

  async list(query: ListCoursesQuery): Promise<CourseResponse[]> {
    const courses = await this.academic.listCourses(query.periodId);

    return courses
      .filter((course) => this.matches(course, query.search))
      .map((course) => this.toResponse(course));
  }

  async findOne(id: string): Promise<CourseResponse> {
    return this.toResponse(await this.academic.findCourse(id));
  }

  private matches(course: AcademicCourse, search?: string): boolean {
    if (search === undefined) {
      return true;
    }
    return course.name.toLowerCase().includes(search.toLowerCase());
  }

  private toResponse(course: AcademicCourse): CourseResponse {
    return { id: course.id, name: course.name, credits: course.credits };
  }
}
