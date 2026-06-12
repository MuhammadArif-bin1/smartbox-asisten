ALTER TABLE "Alarm"
ALTER COLUMN "timezone" SET DEFAULT 'Asia/Jakarta';

CREATE TABLE IF NOT EXISTS "RelaySchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relayNumber" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelaySchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AlarmSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "track" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlarmSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PirGreetingSetting" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "track" INTEGER NOT NULL DEFAULT 10,
    "startTime" TEXT NOT NULL DEFAULT '07:00',
    "endTime" TEXT NOT NULL DEFAULT '22:00',
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 10,
    "playMode" TEXT NOT NULL DEFAULT 'cooldown',
    "days" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PirGreetingSetting_pkey" PRIMARY KEY ("id")
);
