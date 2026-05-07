import { PrismaClient } from "@prisma/client";
import { ACCOUNTS } from "./seed/accounts";
import { seedPeriods } from "./seed/periods";
import { seedBankAccounts } from "./seed/bank-accounts";
import { USERS } from "./seed/users";
import { seedSettings } from "./seed/settings";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("Seeding accounts...");
  // ACCOUNTS uses scalar parent_code fields — compatible with createMany at runtime.
  await prisma.account.createMany({
    data: ACCOUNTS as Parameters<typeof prisma.account.createMany>[0]["data"],
    skipDuplicates: true,
  });

  console.log("Seeding fiscal periods (36 months: prev/current/next year, all OPEN)...");
  await seedPeriods(prisma);

  console.log("Seeding bank accounts...");
  await seedBankAccounts(prisma);

  console.log("Seeding users...");
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
  }

  console.log("Seeding settings...");
  await seedSettings(prisma);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
