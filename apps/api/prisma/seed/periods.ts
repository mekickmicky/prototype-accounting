import type { PrismaClient } from "@prisma/client";

export async function seedPeriods(prisma: PrismaClient): Promise<void> {
  const currentYear = new Date().getFullYear();

  for (let year = currentYear - 1; year <= currentYear + 1; year++) {
    for (let month = 1; month <= 12; month++) {
      const code = `${year}-${String(month).padStart(2, "0")}`;
      const start_date = new Date(Date.UTC(year, month - 1, 1));
      // Last day of month: month=1..12, so month, 0 gives day 0 of next month = last day of current month
      const end_date = new Date(Date.UTC(year, month, 0));

      await prisma.fiscalPeriod.upsert({
        where: { code },
        update: {},
        create: { code, start_date, end_date, status: "OPEN" },
      });
    }
  }
}
