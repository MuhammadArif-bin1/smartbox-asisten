import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("=== RECENT COMMANDS ===");
  const commands = await prisma.deviceCommand.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(commands, null, 2));

  console.log("\n=== RECENT EVENT LOGS ===");
  const events = await prisma.eventLog.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(events, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
