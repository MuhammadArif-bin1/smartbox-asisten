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

  // Seed audio tracks
  const tracks = [
    { track: 1, fileName: "0001.mp3", label: "SmartBox siap digunakan", feature: "system", description: "SmartBox Assistant siap digunakan" },
    { track: 2, fileName: "0002.mp3", label: "Menampilkan jam dan suhu", feature: "system", description: "Menampilkan jam dan suhu real-time" },
    { track: 3, fileName: "0003.mp3", label: "Sapaan Bluetooth", feature: "bluetooth", description: "Sapaan saat Bluetooth baru dinyalakan" },
    { track: 4, fileName: "0004.mp3", label: "Alarm pagi", feature: "alarm", description: "Selamat pagi tuan, aku assistant pribadimu" },
    { track: 5, fileName: "0005.mp3", label: "Alarm siang", feature: "alarm", description: "Selamat siang tuan, aku assistant pribadimu" },
    { track: 6, fileName: "0006.mp3", label: "Alarm sore", feature: "alarm", description: "Selamat sore tuan, aku assistant pribadimu" },
    { track: 7, fileName: "0007.mp3", label: "Asap terdeteksi", feature: "sensor", description: "Peringatan asap terdeteksi" },
    { track: 8, fileName: "0008.mp3", label: "Gas terdeteksi", feature: "sensor", description: "Peringatan gas terdeteksi" },
    { track: 9, fileName: "0009.mp3", label: "Suhu terdeteksi", feature: "sensor", description: "Peringatan suhu terdeteksi melebihi ambang batas" },
    { track: 10, fileName: "0010.mp3", label: "Gerakan berjalan", feature: "pir", description: "Gerakan berjalan terdeteksi" },
    { track: 11, fileName: "0011.mp3", label: "Gerakan melompat", feature: "pir", description: "Gerakan melompat terdeteksi" },
    { track: 12, fileName: "0012.mp3", label: "Gerakan melambaikan tangan", feature: "pir", description: "Gerakan melambaikan tangan terdeteksi" },
    { track: 13, fileName: "0013.mp3", label: "Bluetooth dimatikan", feature: "bluetooth", description: "Bluetooth Smartbox Assistant dimatikan" },
  ];

  console.log("Seeding AudioTrack database...");

  for (const t of tracks) {
    await prisma.audioTrack.upsert({
      where: {
        deviceId_track: {
          deviceId,
          track: t.track,
        },
      },
      update: {
        fileName: t.fileName,
        label: t.label,
        feature: t.feature,
        description: t.description,
      },
      create: {
        deviceId,
        track: t.track,
        fileName: t.fileName,
        label: t.label,
        feature: t.feature,
        description: t.description,
      },
    });
  }

  console.log("AudioTrack seeding completed!");

  // Synchronize alarms in database
  console.log("Synchronizing default Alarms in database...");
  const defaultAlarms = [
    { id: "morning", label: "Pagi", time: "07:00", greeting: "Pengingat aktivitas pagi", dfTrack: 4 },
    { id: "noon", label: "Siang", time: "12:30", greeting: "Pengingat istirahat siang", dfTrack: 5 },
    { id: "evening", label: "Malam", time: "19:30", greeting: "Pengingat istirahat malam", dfTrack: 6 },
  ];

  for (const alarm of defaultAlarms) {
    await prisma.alarm.upsert({
      where: { id: alarm.id },
      update: {
        dfTrack: alarm.dfTrack,
      },
      create: {
        id: alarm.id,
        deviceId,
        label: alarm.label,
        time: alarm.time,
        greeting: alarm.greeting,
        dfTrack: alarm.dfTrack,
        enabled: true,
      },
    });
  }
  console.log("Alarm synchronization completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
