import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ALL GREETING VOICE SCHEDULES ===");
  const schedules = await prisma.greetingVoiceSchedule.findMany();
  console.log(JSON.stringify(schedules, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
