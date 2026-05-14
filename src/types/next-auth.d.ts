import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string;
      tenantId?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
    };
  }

  interface User {
    id: string;
    tenantId?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    tenantId?: string;
    role?: string;
  }
}
