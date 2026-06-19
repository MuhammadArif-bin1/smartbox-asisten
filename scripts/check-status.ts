import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const status = await prisma.smartboxStatus.findUnique({
    where: { deviceId: "smartbox-001" },
  });
  console.log("STATUS:", JSON.stringify(status, null, 2));

  const latestReading = await prisma.sensorReading.findFirst({
    where: { deviceId: "smartbox-001" },
    orderBy: { createdAt: "desc" },
  });
  console.log("LATEST SENSOR READING:", JSON.stringify(latestReading, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
