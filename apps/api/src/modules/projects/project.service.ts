import { prisma } from '../../db/client';
import { CreateProjectInput, UpdateProjectInput, QueryProjectInput } from './project.schema';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('Project:Service');

export class ProjectService {
  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  static async create(organizationId: string, input: CreateProjectInput) {
    const slug = input.slug || this.generateSlug(input.name);

    // Check duplicate slug in same organization
    const existing = await prisma.project.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug,
        },
      },
    });

    if (existing) {
      const err = new Error(`A project with slug '${slug}' already exists in your organization.`);
      (err as unknown as { code: string }).code = 'DUPLICATE_PROJECT';
      throw err;
    }

    const project = await prisma.project.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        rateLimitRpm: input.rateLimitRpm,
        organizationId,
      },
    });

    logger.info(`Project created successfully`, { projectId: project.id, organizationId });
    return project;
  }

  static async list(organizationId: string, query: QueryProjectInput) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: Record<string, unknown> = {
      organizationId,
    };

    if (query.search) {
      whereCondition.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [projects, totalCount] = await Promise.all([
      prisma.project.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              queues: true,
              jobs: true,
              workers: true,
            },
          },
        },
      }),
      prisma.project.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      projects,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  static async getById(organizationId: string, projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            queues: true,
            jobs: true,
            workers: true,
          },
        },
      },
    });

    if (!project) {
      const err = new Error('Project not found.');
      (err as unknown as { code: string }).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    // Cross-organization access prevention
    if (project.organizationId !== organizationId) {
      const err = new Error('Access denied. This project belongs to a different organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    return project;
  }

  static async update(organizationId: string, projectId: string, input: UpdateProjectInput) {
    // Verify existence & ownership first
    await this.getById(organizationId, projectId);

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.rateLimitRpm && { rateLimitRpm: input.rateLimitRpm }),
      },
    });

    logger.info(`Project updated`, { projectId, organizationId });
    return updated;
  }

  static async delete(organizationId: string, projectId: string) {
    // Verify existence & ownership first
    await this.getById(organizationId, projectId);

    await prisma.project.delete({
      where: { id: projectId },
    });

    logger.info(`Project deleted`, { projectId, organizationId });
    return { deleted: true, projectId };
  }
}
