import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "mauro@m8growth.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "trocar-esta-senha";

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Mauro",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "INTERNAL_ADMIN",
      },
    });
    console.log(`Usuário interno admin criado: ${adminEmail}`);
  } else {
    console.log(`Usuário interno admin já existe: ${adminEmail}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
