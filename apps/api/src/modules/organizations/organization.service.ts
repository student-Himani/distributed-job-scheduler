import { prisma } from '../../db/client';
import { CreateOrganizationInput, UpdateOrganizationInput } from './organization.schema';

export class OrganizationService {
  static async create(input: CreateOrganizationInput, userId: string) {
    const orgSlug =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.name,
          slug: orgSlug,
        },
      });

      // Update current user's organization to point to the newly created Organization
      await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: org.id,
        },
      });

      return org;
    });

    return organization;
  }

  static async listAll() {
    return prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            projects: true,
          },
        },
      },
    });
  }

  static async getById(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            users: true,
            projects: true,
          },
        },
      },
    });

    if (!org) {
      const err = new Error('Organization not found');
      (err as unknown as { code: string }).code = 'ORG_NOT_FOUND';
      throw err;
    }

    return org;
  }

  static async update(organizationId: string, input: UpdateOrganizationInput) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      const err = new Error('Organization not found');
      (err as unknown as { code: string }).code = 'ORG_NOT_FOUND';
      throw err;
    }

    return prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: input.name,
      },
    });
  }
}
