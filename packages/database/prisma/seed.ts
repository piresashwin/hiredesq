import { PrismaClient } from "@prisma/client";

// Dev seed — one workspace (free tier) with an owner and a starter credit
// balance, so `pnpm dev` comes up with something to log into and parse against.
// Idempotent: re-running upserts the same fixtures.
const prisma = new PrismaClient();

const DEV_USER_EMAIL = "founder@hiredesq.dev";
const FREE_TIER_CREDITS = 5; // daily free-tier allotment (MVP-SPEC §4)

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: {
      email: DEV_USER_EMAIL,
      // Dev-only placeholder hash — replace with real auth before launch.
      passwordHash: "dev-not-a-real-hash",
      fullName: "Dev Founder",
    },
  });

  // Find or create the dev workspace by name for this owner.
  const existing = await prisma.workspace.findFirst({
    where: { name: "Dev Agency", memberships: { some: { userId: user.id } } },
  });

  const workspace =
    existing ??
    (await prisma.workspace.create({
      data: {
        name: "Dev Agency",
        plan: "free",
        memberships: { create: { userId: user.id, role: "owner" } },
        creditAccount: {
          create: {
            balance: FREE_TIER_CREDITS,
            // Granted now so the lazy daily renewal doesn't re-grant today.
            dailyAllotment: FREE_TIER_CREDITS,
            lastGrantedAt: new Date(),
          },
        },
      },
    }));

  console.log(`seeded workspace=${workspace.id} owner=${user.id} credits=${FREE_TIER_CREDITS}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
