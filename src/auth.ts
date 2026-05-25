import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { assertRequiredEnv } from '@/lib/server/env';
import { BETA_NDA_VERSION, isBetaNdaRequiredForTenant } from '@/lib/server/beta-nda';
import { enforceRateLimit } from '@/lib/server/request-security';
import { MASTER_TENANT_EMAILS } from '@/lib/tenant-constants';

assertRequiredEnv(['NEXTAUTH_SECRET'], 'authentication');

const cleanEnvValue = (value: string | undefined) =>
  value?.replace(/\\r\\n|\\n|\\r/g, '').trim() || '';

const SEED_USER_ID = 'vercel-seed-admin';

const normalizeNextAuthUrl = () => {
  const current = cleanEnvValue(process.env.NEXTAUTH_URL);
  if (process.env.NODE_ENV === 'development') {
    if (!current || current.includes('vercel.app')) {
      return '';
    }
  }

  return current;
};

const resolveNextAuthSecret = () => {
  const configuredSecret = cleanEnvValue(process.env.NEXTAUTH_SECRET);
  if (configuredSecret) return configuredSecret;

  if (process.env.NODE_ENV === 'development') {
    return 'safeviate-development-nextauth-secret';
  }

  throw new Error('[auth] NEXTAUTH_SECRET is required.');
};

const normalizedNextAuthUrl = normalizeNextAuthUrl();
if (normalizedNextAuthUrl) {
  process.env.NEXTAUTH_URL = normalizedNextAuthUrl;
} else {
  delete process.env.NEXTAUTH_URL;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  secret: resolveNextAuthSecret(),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const email = credentials?.email?.toString().toLowerCase().trim();
        const password = credentials?.password?.toString();
        const configuredSeedEmail = cleanEnvValue(process.env.AUTH_SEED_EMAIL).toLowerCase();
        const seedPasswordHash = cleanEnvValue(process.env.AUTH_SEED_PASSWORD_HASH);
        const seedPassword = cleanEnvValue(process.env.AUTH_SEED_PASSWORD);
        const fallbackSeedEmails = process.env.NODE_ENV === 'development'
          ? MASTER_TENANT_EMAILS.map((value) => value.toLowerCase())
          : [];
        const seedEmails = new Set([
          configuredSeedEmail,
          ...fallbackSeedEmails,
        ].filter(Boolean));
        const isSeedEmail = Boolean(email && seedEmails.has(email));
        const effectiveSeedPassword = seedPassword || (process.env.NODE_ENV === 'development' ? 'SafeviateTemp2026!' : '');
        const effectiveSeedPasswordHash = seedPasswordHash || '';

        if (!email || !password) return null;

        const rateLimit = enforceRateLimit({
          request,
          key: 'auth-login',
          limit: 8,
          identity: email,
        });
        if (rateLimit) {
          console.warn('[AUTH] Login throttled due to rate limit.', { email });
          throw new Error('Too many login attempts. Please wait a moment and try again.');
        }

        console.info('[AUTH] Credentials login attempt received.', {
          email,
          seedEmailConfigured: Boolean(configuredSeedEmail),
          seedHashConfigured: Boolean(effectiveSeedPasswordHash),
          seedPasswordConfigured: Boolean(effectiveSeedPassword),
          seedEmailMatched: isSeedEmail,
          nextAuthUrl: cleanEnvValue(process.env.NEXTAUTH_URL),
        });

        if (isSeedEmail) {
          if (effectiveSeedPasswordHash) {
            const ok = await compare(password, effectiveSeedPasswordHash);
            console.info('[AUTH] Password hash compare result:', ok);
            if (!ok) return null;
          } else if (effectiveSeedPassword) {
            console.info('[AUTH] Plain seed password configured; comparing directly.');
            if (password !== effectiveSeedPassword) return null;
          } else {
            console.warn('[AUTH] Seed email matched but no password secret is configured.');
            return null;
          }

          return {
            id: SEED_USER_ID,
            tenantId: 'safeviate',
            email,
            name: 'Admin',
            role: 'developer',
          };
        }

        let dbUser = null;
        try {
          dbUser = await prisma.user.findUnique({ where: { email } });
        } catch (error) {
          console.error('[AUTH] Database lookup failed, falling back to seed credentials when possible.', error);
        }

        if (dbUser?.suspendedAt) {
          console.warn('[AUTH] Login denied because the account is suspended.', { email });
          return null;
        }

        if (dbUser) {
          if (!dbUser.passwordHash) {
            const pendingInvite = await prisma.passwordSetupInvite.findFirst({
              where: {
                email: dbUser.email.trim().toLowerCase(),
                usedAt: null,
              },
              select: { id: true },
            }).catch(() => null);

            if (pendingInvite) {
              throw new Error('Password setup is still pending. Please open the reset link you received and save a new password.');
            }

            throw new Error('This account does not have an active password yet. Please request a new password reset link.');
          }

          const betaNdaRequired = await isBetaNdaRequiredForTenant(dbUser.tenantId);
          const ndaAcceptance = await prisma.betaNdaAcceptance.findUnique({
            where: {
              tenantId_email_ndaVersion: {
                tenantId: dbUser.tenantId.trim() || 'safeviate',
                email: dbUser.email.trim().toLowerCase(),
                ndaVersion: BETA_NDA_VERSION,
              },
            },
            select: { id: true },
          });

          if (betaNdaRequired && !ndaAcceptance) {
            console.warn('[AUTH] Login denied because the NDA has not been accepted.', { email });
            return null;
          }
        }

        if (dbUser?.passwordHash) {
          const looksHashed = /^\$2[aby]\$\d{2}\$/.test(dbUser.passwordHash);
          const ok = looksHashed ? await compare(password, dbUser.passwordHash) : password === dbUser.passwordHash;
          console.info('[AUTH] Database password compare result:', ok, { looksHashed });

          if (ok) {
            if (!looksHashed) {
              const upgradedHash = await hash(password, 12);
              await prisma.user.update({
                where: { id: dbUser.id },
                data: { passwordHash: upgradedHash },
              });
            }

            return {
              id: dbUser.id,
              tenantId: dbUser.tenantId,
              email: dbUser.email,
              name: `${dbUser.firstName} ${dbUser.lastName}`.trim(),
              role: dbUser.role,
            };
          }
        }

        if (!configuredSeedEmail) {
          console.warn('[AUTH] Missing AUTH_SEED_EMAIL in runtime env.');
          return null;
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name || token.name;
        token.tenantId = user.tenantId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) || undefined;
        session.user.email = (token.email as string | undefined) || undefined;
        session.user.name = (token.name as string | undefined) || undefined;
        session.user.tenantId = (token.tenantId as string | undefined) || undefined;
        session.user.role = (token.role as string | undefined) || undefined;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
