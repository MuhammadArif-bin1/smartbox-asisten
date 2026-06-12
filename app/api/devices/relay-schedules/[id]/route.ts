import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await request.json();
    const { name, relayNumber, startTime, endTime, days, enabled } = body;

    const updatedSchedule = await prisma.relaySchedule.update({
      where: { id },
      data: {
        name,
        relayNumber: relayNumber !== undefined ? Number(relayNumber) : undefined,
        startTime,
        endTime,
        days: days !== undefined ? (typeof days === "string" ? days : JSON.stringify(days)) : undefined,
        enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      },
    });

    return NextResponse.json(updatedSchedule);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memperbarui jadwal",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    await prisma.relaySchedule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Jadwal berhasil dihapus" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal menghapus jadwal",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
