import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const deviceId = "smartbox-001";

  // Ensure device exists
  await prisma.device.upsert({
    where: { deviceId },
    update: {},
    create: {
      id: deviceId,
      deviceId,
      name: "SmartBox Assistant S3",
      status: "offline",
    },
  });
  console.log("Device synchronization completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
