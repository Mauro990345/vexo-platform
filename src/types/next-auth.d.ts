import { type UserRole } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    clinicId: string | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: UserRole;
      clinicId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
    clinicId: string | null;
  }
}
