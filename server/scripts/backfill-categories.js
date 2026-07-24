// One-time additive backfill: ensure every existing user has the default
// category set (Work, School, Adulting Chores, Personal). Safe to re-run —
// skipDuplicates + the (name, userId) unique constraint make it idempotent.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULTS = [
  { name: 'Work', color: '#000000', icon: 'briefcase' },
  { name: 'School', color: '#000000', icon: 'graduation-cap' },
  { name: 'Adulting Chores', color: '#000000', icon: 'home' },
  { name: 'Personal', color: '#000000', icon: 'user' },
];

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  for (const user of users) {
    const { count } = await prisma.category.createMany({
      data: DEFAULTS.map((c) => ({ ...c, userId: user.id })),
      skipDuplicates: true,
    });
    console.log(`${user.email}: +${count} categories`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
