import { PrismaClient } from "@denshees/database/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as any;
const PRISMA_SCHEMA_REV = 5;

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

function getClient() {
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaSchemaRev === PRISMA_SCHEMA_REV
  ) {
    return globalForPrisma.prisma;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaSchemaRev = PRISMA_SCHEMA_REV;
  }
  return client;
}

const prisma = getClient();

export { prisma };
