const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create categories
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

  // Create labels
  const urgent = await prisma.label.create({
    data: { name: 'urgent', color: '#ff0040' },
  });
  const bug = await prisma.label.create({
    data: { name: 'bug', color: '#ff6600' },
  });
  const feature = await prisma.label.create({
    data: { name: 'feature', color: '#00f0ff' },
  });
  const research = await prisma.label.create({
    data: { name: 'research', color: '#b400ff' },
  });

  // Create sample tickets
  await prisma.ticket.createMany({
    data: [
      {
        title: 'Set up CI/CD pipeline',
        description: 'Configure GitHub Actions for automated testing and deployment',
        status: 'TODO',
        priority: 'HIGH',
        categoryId: work.id,
        order: 0,
      },
      {
        title: 'Complete data mining homework',
        description: 'Finish clustering analysis and write up results',
        status: 'IN_PROGRESS',
        priority: 'CRITICAL',
        categoryId: school.id,
        dueDate: new Date('2026-04-10'),
        order: 0,
      },
      {
        title: 'Meal prep for the week',
        description: 'Plan meals, grocery list, and batch cook on Sunday',
        status: 'BACKLOG',
        priority: 'LOW',
        categoryId: personal.id,
        order: 0,
      },
      {
        title: 'Write API documentation',
        description: 'Document all REST endpoints with request/response examples',
        status: 'TODO',
        priority: 'MEDIUM',
        categoryId: docs.id,
        order: 1,
      },
      {
        title: 'Fix login redirect bug',
        description: 'Users are not being redirected after OAuth callback',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        categoryId: work.id,
        order: 1,
      },
      {
        title: 'Study for deep learning midterm',
        description: 'Review CNNs, RNNs, and transformer architecture',
        status: 'BACKLOG',
        priority: 'HIGH',
        categoryId: school.id,
        dueDate: new Date('2026-04-15'),
        order: 1,
      },
    ],
  });

  console.log('⚡ Database seeded successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
