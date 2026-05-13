import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AppProviders } from '@/providers';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { assertRequiredEnv } from '@/lib/server/env';
import { ensureTenantConfigSchema } from '@/lib/server/bootstrap-db';
import {
  MASTER_TENANT_ID,
  TENANT_OVERRIDE_COOKIE,
  isMasterTenantEmail,
} from '@/lib/server/tenant-access';

assertRequiredEnv(
  [['DATABASE_URL', 'DATABASE_URL_UNPOOLED'], 'NEXTAUTH_SECRET', 'OPENAI_API_KEY'],
  'application bootstrap'
);

export const metadata: Metadata = {
  title: 'Safeviate Manager',
  description: 'Aviation Academy Management',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/safeviate-icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/safeviate-icon.svg'],
    apple: ['/safeviate-icon.svg'],
  },
};

type TenantThemeConfig = Record<string, unknown> | null;
type TenantBootstrapConfig = {
  theme: TenantThemeConfig;
  tenant: Record<string, unknown> | null;
};

declare global {
  interface Window {
    __SAFEVIATE_THEME_BOOTSTRAP__?: {
      theme?: Record<string, unknown> | null;
      tenant?: Record<string, unknown> | null;
    };
  }
}

async function getInitialTenantBootstrap(): Promise<TenantBootstrapConfig> {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return { theme: null, tenant: null };

    await ensureTenantConfigSchema();

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    });

    const baseTenantId = dbUser?.tenantId || MASTER_TENANT_ID;
    let tenantId = baseTenantId;

    if (isMasterTenantEmail(email)) {
      const cookieStore = await cookies();
      const requestedTenantId = cookieStore.get(TENANT_OVERRIDE_COOKIE)?.value?.trim();

      if (requestedTenantId && requestedTenantId !== baseTenantId) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: requestedTenantId },
          select: { id: true },
        });
        tenantId = tenant?.id || baseTenantId;
      }
    }

    const configRow = await prisma.tenantConfig.findUnique({
      where: { tenantId },
      select: { data: true },
    });

    const config =
      configRow?.data && typeof configRow.data === 'object'
        ? (configRow.data as Record<string, unknown>)
        : null;
    const tenantRow = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
      },
    }).catch(() => null);

    const tenantConfigWithoutIndustry = config
      ? Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'industry'))
      : null;

    return {
      theme: config?.theme && typeof config.theme === 'object'
        ? (config.theme as Record<string, unknown>)
        : null,
      tenant: tenantRow
        ? {
            ...tenantRow,
            ...(tenantConfigWithoutIndustry || {}),
          }
        : null,
    };
  } catch {
    return { theme: null, tenant: null };
  }
}

function buildThemeBootstrapScript(bootstrap: TenantBootstrapConfig) {
  const serializedServerTheme = JSON.stringify(bootstrap.theme ?? null).replace(/</g, '\\u003c');
  const serializedServerTenant = JSON.stringify(bootstrap.tenant ?? null).replace(/</g, '\\u003c');

  return `
(() => {
  const LOCAL_TENANT_CONFIG_KEY = 'safeviate:tenant-config-local-override';
  const SCALE_KEY = 'safeviate-scale';
  const serverTheme = ${serializedServerTheme};
  const authRoutes = ['/login', '/forgot-password', '/setup-password', '/beta-nda'];

  const defaults = {
    main: {
      background: '#ebf5fb',
      primary: '#7cc4f7',
      'primary-foreground': '#1e293b',
      accent: '#63b2a7',
    },
    button: {
      'button-primary-background': '#7cc4f7',
      'button-primary-foreground': '#1e293b',
      'button-primary-border': '#7cc4f7',
      'button-primary-accent': '#63b2a7',
      'button-primary-accent-foreground': '#ffffff',
      'button-secondary-background': '#ffffff',
      'button-secondary-foreground': '#1e293b',
      'button-secondary-border': '#cbd5e1',
      'button-secondary-accent': '#eef4fb',
      'button-secondary-accent-foreground': '#1e293b',
    },
    card: {
      card: '#ebf5fb',
      'card-foreground': '#1e293b',
      'card-border': '#d1d5db',
    },
    popover: {
      popover: '#ebf5fb',
      'popover-foreground': '#1e293b',
      'popover-accent': '#7cc4f7',
      'popover-accent-foreground': '#1e293b',
    },
    sidebar: {
      'sidebar-background': '#dbeafb',
      'sidebar-foreground': '#1e293b',
      'sidebar-button-background': '#e8f1fa',
      'sidebar-accent': '#f1f5f9',
      'sidebar-accent-foreground': '#1e293b',
      'sidebar-border': '#94a3b8',
    },
    header: {
      'header-background': '#171514',
      'header-foreground': '#f3efe8',
      'header-border': '#3a312b',
      'header-button-background': '#ffffff',
      'header-button-foreground': '#1e293b',
      'header-button-border': '#cbd5e1',
      'header-button-hover': '#eef4fb',
    },
    swimlane: {
      'swimlane-header-background': '#f1f5f9',
      'swimlane-header-foreground': '#475569',
    },
    matrix: {
      'matrix-header-background': '#e0f2fe',
      'matrix-header-foreground': '#1e293b',
      'matrix-subheader-background': '#f8fafc',
      'matrix-subheader-foreground': '#1e293b',
    },
  };

  const hexToHsl = (hex) => {
    if (typeof hex !== 'string') return null;
    const normalized = hex.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalized)) return null;

    const expanded = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;

    const r = parseInt(expanded.slice(0, 2), 16) / 255;
    const g = parseInt(expanded.slice(2, 4), 16) / 255;
    const b = parseInt(expanded.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }

    return \`\${Math.round(h * 360)} \${Math.round(s * 100)}% \${Math.round(l * 100)}%\`;
  };

  const applyColorGroup = (group) => {
    if (!group || typeof group !== 'object') return;
    Object.entries(group).forEach(([key, value]) => {
      const hsl = hexToHsl(value);
      if (hsl) {
        document.documentElement.style.setProperty(\`--\${key}\`, hsl);
      }
    });
  };

  try {
    const pathname = window.location.pathname || '';
    const isAuthRoute = authRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));
    const raw = window.localStorage.getItem(LOCAL_TENANT_CONFIG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const localTheme = !isAuthRoute && parsed && parsed.theme && typeof parsed.theme === 'object' ? parsed.theme : null;

    applyColorGroup({ ...defaults.main, ...(serverTheme && serverTheme.main ? serverTheme.main : {}), ...(localTheme && localTheme.main ? localTheme.main : {}) });
    applyColorGroup({ ...defaults.button, ...(serverTheme && serverTheme.button ? serverTheme.button : {}), ...(localTheme && localTheme.button ? localTheme.button : {}) });
    applyColorGroup({ ...defaults.card, ...(serverTheme && serverTheme.card ? serverTheme.card : {}), ...(localTheme && localTheme.card ? localTheme.card : {}) });
    applyColorGroup({ ...defaults.popover, ...(serverTheme && serverTheme.popover ? serverTheme.popover : {}), ...(localTheme && localTheme.popover ? localTheme.popover : {}) });
    applyColorGroup({ ...defaults.sidebar, ...(serverTheme && serverTheme.sidebar ? serverTheme.sidebar : {}), ...(localTheme && localTheme.sidebar ? localTheme.sidebar : {}) });
    applyColorGroup({ ...defaults.header, ...(serverTheme && serverTheme.header ? serverTheme.header : {}), ...(localTheme && localTheme.header ? localTheme.header : {}) });
    applyColorGroup({ ...defaults.swimlane, ...(serverTheme && serverTheme.swimlane ? serverTheme.swimlane : {}), ...(localTheme && localTheme.swimlane ? localTheme.swimlane : {}) });
    applyColorGroup({ ...defaults.matrix, ...(serverTheme && serverTheme.matrix ? serverTheme.matrix : {}), ...(localTheme && localTheme.matrix ? localTheme.matrix : {}) });

    const sidebarBackgroundImage =
      localTheme && typeof localTheme.sidebarBackgroundImage === 'string'
        ? localTheme.sidebarBackgroundImage
        : (serverTheme && typeof serverTheme.sidebarBackgroundImage === 'string' ? serverTheme.sidebarBackgroundImage : '');
    const headerBackgroundImage =
      localTheme && typeof localTheme.headerBackgroundImage === 'string'
        ? localTheme.headerBackgroundImage
        : (serverTheme && typeof serverTheme.headerBackgroundImage === 'string' ? serverTheme.headerBackgroundImage : '');
    const sidebarLogoImage =
      localTheme && typeof localTheme.sidebarLogoImage === 'string' && localTheme.sidebarLogoImage.trim()
        ? localTheme.sidebarLogoImage
        : (serverTheme && typeof serverTheme.sidebarLogoImage === 'string' ? serverTheme.sidebarLogoImage : '');
    const sidebarLogoBackgroundColor =
      localTheme && typeof localTheme.sidebarLogoBackgroundColor === 'string'
        ? localTheme.sidebarLogoBackgroundColor
        : (serverTheme && typeof serverTheme.sidebarLogoBackgroundColor === 'string' ? serverTheme.sidebarLogoBackgroundColor : '');
    const sidebarBackgroundOpacity =
      typeof (localTheme && localTheme.sidebarBackgroundOpacity) === 'number'
        ? localTheme.sidebarBackgroundOpacity
        : (typeof (serverTheme && serverTheme.sidebarBackgroundOpacity) === 'number' ? serverTheme.sidebarBackgroundOpacity : 0.2);
    const headerBackgroundOpacity =
      typeof (localTheme && localTheme.headerBackgroundOpacity) === 'number'
        ? localTheme.headerBackgroundOpacity
        : (typeof (serverTheme && serverTheme.headerBackgroundOpacity) === 'number' ? serverTheme.headerBackgroundOpacity : 0.22);

    document.documentElement.style.setProperty('--sidebar-background-image', sidebarBackgroundImage ? \`url("\${sidebarBackgroundImage}")\` : 'none');
    document.documentElement.style.setProperty('--header-background-image', headerBackgroundImage ? \`url("\${headerBackgroundImage}")\` : 'none');
    document.documentElement.style.setProperty('--sidebar-background-opacity', String(sidebarBackgroundOpacity));
    document.documentElement.style.setProperty('--header-background-opacity', String(headerBackgroundOpacity));

    let scale = 100;

    if (!isAuthRoute) {
      const themeScale =
        typeof (localTheme && localTheme.scale) === 'number'
          ? localTheme.scale
          : (typeof (serverTheme && serverTheme.scale) === 'number' ? serverTheme.scale : null);
      const localScaleRaw = window.localStorage.getItem(SCALE_KEY);
      const localScale = localScaleRaw ? JSON.parse(localScaleRaw) : null;
      scale = typeof themeScale === 'number' ? themeScale : (typeof localScale === 'number' ? localScale : 100);
      document.documentElement.style.fontSize = \`\${scale}%\`;
    } else {
      document.documentElement.style.fontSize = '100%';
    }

    window.__SAFEVIATE_THEME_BOOTSTRAP__ = {
      theme: {
        main: { ...defaults.main, ...(serverTheme && serverTheme.main ? serverTheme.main : {}), ...(localTheme && localTheme.main ? localTheme.main : {}) },
        button: { ...defaults.button, ...(serverTheme && serverTheme.button ? serverTheme.button : {}), ...(localTheme && localTheme.button ? localTheme.button : {}) },
        card: { ...defaults.card, ...(serverTheme && serverTheme.card ? serverTheme.card : {}), ...(localTheme && localTheme.card ? localTheme.card : {}) },
        popover: { ...defaults.popover, ...(serverTheme && serverTheme.popover ? serverTheme.popover : {}), ...(localTheme && localTheme.popover ? localTheme.popover : {}) },
        sidebar: { ...defaults.sidebar, ...(serverTheme && serverTheme.sidebar ? serverTheme.sidebar : {}), ...(localTheme && localTheme.sidebar ? localTheme.sidebar : {}) },
        header: { ...defaults.header, ...(serverTheme && serverTheme.header ? serverTheme.header : {}), ...(localTheme && localTheme.header ? localTheme.header : {}) },
        swimlane: { ...defaults.swimlane, ...(serverTheme && serverTheme.swimlane ? serverTheme.swimlane : {}), ...(localTheme && localTheme.swimlane ? localTheme.swimlane : {}) },
        matrix: { ...defaults.matrix, ...(serverTheme && serverTheme.matrix ? serverTheme.matrix : {}), ...(localTheme && localTheme.matrix ? localTheme.matrix : {}) },
        sidebarBackgroundImage,
        headerBackgroundImage,
        sidebarLogoImage,
        sidebarLogoBackgroundColor,
        sidebarBackgroundOpacity,
        headerBackgroundOpacity,
        scale,
      },
      tenant: ${serializedServerTenant},
    };
  } catch {
    // Keep the CSS defaults when browser storage is unavailable or malformed.
  }
})();
`;
}

function hexToHslString(hex: string) {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalized)) return null;

  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function buildServerThemeStyle(theme: TenantThemeConfig) {
  if (!theme || typeof theme !== 'object') {
    return undefined;
  }

  const style: Record<string, string> = {};
  const themeGroups = ['main', 'button', 'card', 'popover', 'sidebar', 'header', 'swimlane', 'matrix'] as const;

  for (const groupName of themeGroups) {
    const group = theme[groupName];
    if (!group || typeof group !== 'object') continue;

    for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const hsl = hexToHslString(value);
      if (!hsl) continue;
      style[`--${key}`] = hsl;
    }
  }

  if (typeof theme.sidebarBackgroundImage === 'string') {
    style['--sidebar-background-image'] = theme.sidebarBackgroundImage
      ? `url("${theme.sidebarBackgroundImage}")`
      : 'none';
  }

  if (typeof theme.headerBackgroundImage === 'string') {
    style['--header-background-image'] = theme.headerBackgroundImage
      ? `url("${theme.headerBackgroundImage}")`
      : 'none';
  }

  if (typeof theme.sidebarBackgroundOpacity === 'number') {
    style['--sidebar-background-opacity'] = String(theme.sidebarBackgroundOpacity);
  }

  if (typeof theme.headerBackgroundOpacity === 'number') {
    style['--header-background-opacity'] = String(theme.headerBackgroundOpacity);
  }

  if (typeof theme.scale === 'number') {
    style.fontSize = `${theme.scale}%`;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTenantBootstrap = await getInitialTenantBootstrap();
  const serverThemeStyle = buildServerThemeStyle(initialTenantBootstrap.theme);

  return (
    <html lang="en" suppressHydrationWarning style={serverThemeStyle}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: buildThemeBootstrapScript(initialTenantBootstrap) }} />
      </head>
      <body className="font-body antialiased">
        <AppProviders>
          {children}
          <Toaster />
        </AppProviders>
      </body>
    </html>
  );
}
