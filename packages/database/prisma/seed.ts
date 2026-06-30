import { PrismaClient, Prisma } from "@prisma/client";

// Dev seed — one workspace (free tier) with an owner and a starter credit
// balance, so `pnpm dev` comes up with something to log into and parse against.
// Idempotent: re-running upserts the same fixtures.
const prisma = new PrismaClient();

const DEV_USER_EMAIL = "founder@hiredesq.dev";
const FREE_TIER_CREDITS = 20; // monthly free-tier submission allotment (MVP-SPEC §4)

async function main() {
  // ── Plan reference data (global pricing config, not tenant-scoped) ──
  // Upsert all three tiers idempotently. priceMonthly is Decimal (§3).
  // ingestPeriod drives the ingest meter reset:
  //   "lifetime" = monotonic (free — never resets)
  //   "monthly"  = resets each UTC calendar month (solo_pro)
  //   null       = unmetered (team)
  await prisma.plan.upsert({
    where: { tier: "free" },
    update: {
      monthlySubmissionAllotment: 20,
      ingestFreeLimit: 500,
      ingestPeriod: "lifetime",
    },
    create: {
      tier: "free",
      name: "Free",
      priceMonthly: new Prisma.Decimal("0.00"),
      currency: "USD",
      perSeat: false,
      monthlySubmissionAllotment: 20,
      ingestFreeLimit: 500,
      ingestPeriod: "lifetime",
      seatLimit: 1,
    },
  });

  await prisma.plan.upsert({
    where: { tier: "solo_pro" },
    update: {
      monthlySubmissionAllotment: 100,
      ingestFreeLimit: 200,
      ingestPeriod: "monthly",
    },
    create: {
      tier: "solo_pro",
      name: "Solo Pro",
      priceMonthly: new Prisma.Decimal("29.00"),
      currency: "USD",
      perSeat: false,
      monthlySubmissionAllotment: 100,
      ingestFreeLimit: 200,
      ingestPeriod: "monthly",
      seatLimit: 1,
    },
  });

  await prisma.plan.upsert({
    where: { tier: "team" },
    update: {
      monthlySubmissionAllotment: 10000,
      ingestFreeLimit: null,
      ingestPeriod: null,
    },
    create: {
      tier: "team",
      name: "Team",
      priceMonthly: new Prisma.Decimal("39.00"),
      currency: "USD",
      perSeat: true,
      monthlySubmissionAllotment: 10000,
      ingestFreeLimit: null, // null = unmetered ingest
      ingestPeriod: null,    // null = unmetered
      seatLimit: 10,
    },
  });
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
            // Granted now so the lazy monthly renewal doesn't re-grant this month.
            monthlyAllotment: FREE_TIER_CREDITS,
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
