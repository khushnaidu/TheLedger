const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Only seed if no categories exist (first deploy)
  const count = await prisma.category.count();
  if (count > 0) {
    console.log('Database already seeded, skipping');
    return;
  }

  const work = await prisma.category.create({
    data: { name: 'Work', color: '#00f0ff', icon: 'briefcase' },
  });
  const school = await prisma.category.create({
    data: { name: 'School', color: '#b400ff', icon: 'graduation-cap' },
  });
  const personal = await prisma.category.create({
    data: { name: 'Personal', color: '#ff00a0', icon: 'user' },
  });
  const docs = await prisma.category.create({
    data: { name: 'Documentation', color: '#00ff9f', icon: 'file-text' },
  });

  await prisma.label.createMany({
    data: [
      { name: 'urgent', color: '#ff0040' },
      { name: 'bug', color: '#ff6600' },
      { name: 'feature', color: '#00f0ff' },
      { name: 'research', color: '#b400ff' },
    ],
  });

  await prisma.ticket.createMany({
    data: [
      { title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated testing and deployment', status: 'TODO', priority: 'HIGH', categoryId: work.id, order: 0 },
      { title: 'Complete data mining homework', description: 'Finish clustering analysis and write up results', status: 'IN_PROGRESS', priority: 'CRITICAL', categoryId: school.id, dueDate: new Date('2026-04-10'), order: 0 },
      { title: 'Meal prep for the week', description: 'Plan meals, grocery list, and batch cook on Sunday', status: 'BACKLOG', priority: 'LOW', categoryId: personal.id, order: 0 },
      { title: 'Write API documentation', description: 'Document all REST endpoints with request/response examples', status: 'TODO', priority: 'MEDIUM', categoryId: docs.id, order: 1 },
      { title: 'Fix login redirect bug', description: 'Users are not being redirected after OAuth callback', status: 'IN_PROGRESS', priority: 'HIGH', categoryId: work.id, order: 1 },
      { title: 'Study for deep learning midterm', description: 'Review CNNs, RNNs, and transformer architecture', status: 'BACKLOG', priority: 'HIGH', categoryId: school.id, dueDate: new Date('2026-04-15'), order: 1 },
    ],
  });

  console.log('Database seeded successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
