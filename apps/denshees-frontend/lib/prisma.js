import { PrismaClient } from "@denshees/database/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis;

const PRISMA_SCHEMA_REV = 7;

function createPrismaClient() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
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

export default prisma;
