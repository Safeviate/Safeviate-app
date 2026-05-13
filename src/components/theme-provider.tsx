'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { hexToHsl } from '@/lib/utils';
import { useTenantConfig } from '@/hooks/use-tenant-config';

// --- Types ---
type ThemeColors = {
  background: string;
  primary: string;
  'primary-foreground': string;
  accent: string;
};

type ButtonThemeColors = {
  'button-primary-background': string;
  'button-primary-foreground': string;
  'button-primary-border': string;
  'button-primary-accent': string;
  'button-primary-accent-foreground': string;
  'button-secondary-background': string;
  'button-secondary-foreground': string;
  'button-secondary-border': string;
  'button-secondary-accent': string;
  'button-secondary-accent-foreground': string;
};

type CardThemeColors = {
  card: string;
  'card-foreground': string;
  'card-border': string;
};

type PopoverThemeColors = {
  popover: string;
  'popover-foreground': string;
  'popover-accent': string;
  'popover-accent-foreground': string;
};

type SidebarThemeColors = {
  'sidebar-background': string;
  'sidebar-foreground': string;
  'sidebar-button-background': string;
  'sidebar-accent': string;
  'sidebar-accent-foreground': string;
  'sidebar-border': string;
};

type HeaderThemeColors = {
  'header-background': string;
  'header-foreground': string;
  'header-border': string;
  'header-button-background': string;
  'header-button-foreground': string;
  'header-button-border': string;
  'header-button-hover': string;
};

type SwimlaneThemeColors = {
  'swimlane-header-background': string;
  'swimlane-header-foreground': string;
};

type MatrixThemeColors = {
  'matrix-header-background': string;
  'matrix-header-foreground': string;
  'matrix-subheader-background': string;
  'matrix-subheader-foreground': string;
};

export type SavedTheme = {
  name: string;
  colors: ThemeColors;
  buttonColors: ButtonThemeColors;
  cardColors: CardThemeColors;
  sidebarColors: SidebarThemeColors;
  sidebarBackgroundImage?: string;
  sidebarBackgroundOpacity?: number;
  sidebarLogoImage?: string;
  sidebarLogoBackgroundColor?: string;
  headerColors: HeaderThemeColors;
  headerBackgroundImage?: string;
  headerBackgroundOpacity?: number;
  popoverColors: PopoverThemeColors;
  swimlaneColors: SwimlaneThemeColors;
  matrixColors: MatrixThemeColors;
  scale?: number;
};

export type UiMode = 'classic' | 'modern';

type ThemeContextType = {
  theme: ThemeColors;
  setThemeValue: (key: keyof ThemeColors, value: string) => void;
  buttonTheme: ButtonThemeColors;
  setButtonThemeValue: (key: keyof ButtonThemeColors, value: string) => void;
  cardTheme: CardThemeColors;
  setCardThemeValue: (key: keyof CardThemeColors, value: string) => void;
  popoverTheme: PopoverThemeColors;
  setPopoverThemeValue: (key: keyof PopoverThemeColors, value: string) => void;
  sidebarTheme: SidebarThemeColors;
  setSidebarThemeValue: (key: keyof SidebarThemeColors, value: string) => void;
  sidebarBackgroundImage: string;
  setSidebarBackgroundImage: (value: string) => void;
  sidebarBackgroundOpacity: number;
  setSidebarBackgroundOpacity: (value: number) => void;
  sidebarLogoImage: string;
  setSidebarLogoImage: (value: string) => void;
  sidebarLogoBackgroundColor: string;
  setSidebarLogoBackgroundColor: (value: string) => void;
  headerTheme: HeaderThemeColors;
  setHeaderThemeValue: (key: keyof HeaderThemeColors, value: string) => void;
  headerBackgroundImage: string;
  setHeaderBackgroundImage: (value: string) => void;
  headerBackgroundOpacity: number;
  setHeaderBackgroundOpacity: (value: number) => void;
  swimlaneTheme: SwimlaneThemeColors;
  setSwimlaneThemeValue: (key: keyof SwimlaneThemeColors, value: string) => void;
  matrixTheme: MatrixThemeColors;
  setMatrixThemeValue: (key: keyof MatrixThemeColors, value: string) => void;
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  scale: number;
  setScale: (scale: number) => void;
  savedThemes: SavedTheme[];
  saveCurrentTheme: (name: string) => void;
  applySavedTheme: (theme: SavedTheme) => void;
  deleteSavedTheme: (name: string) => void;
  resetToDefaults: () => void;
};

// --- Constants ---
export const THEME_KEY = 'safeviate-theme';
export const BUTTON_THEME_KEY = 'safeviate-button-theme';
export const CARD_THEME_KEY = 'safeviate-card-theme';
export const POPOVER_THEME_KEY = 'safeviate-popover-theme';
export const SIDEBAR_THEME_KEY = 'safeviate-sidebar-theme';
export const SIDEBAR_BACKGROUND_IMAGE_KEY = 'safeviate-sidebar-background-image';
export const SIDEBAR_LOGO_IMAGE_KEY = 'safeviate-sidebar-logo-image';
export const HEADER_BACKGROUND_IMAGE_KEY = 'safeviate-header-background-image';
export const HEADER_THEME_KEY = 'safeviate-header-theme';
export const SWIMLANE_THEME_KEY = 'safeviate-swimlane-theme';
export const MATRIX_THEME_KEY = 'safeviate-matrix-theme';
export const SCALE_KEY = 'safeviate-scale';
export const SAVED_THEMES_KEY = 'safeviate-saved-themes';
const AUTH_ROUTES = ['/login', '/forgot-password', '/setup-password', '/beta-nda'];

type BootstrapThemeSnapshot = NonNullable<Window['__SAFEVIATE_THEME_BOOTSTRAP__']>;

// --- Default Values ---
const defaultColors: ThemeColors = {
  background: '#ebf5fb',
  primary: '#7cc4f7',
  'primary-foreground': '#1e293b',
  accent: '#63b2a7',
};
const defaultButtonColors: ButtonThemeColors = {
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
};
const defaultCardColors: CardThemeColors = {
  card: '#ebf5fb',
  'card-foreground': '#1e293b',
  'card-border': '#d1d5db',
};
const defaultPopoverColors: PopoverThemeColors = {
    popover: '#ebf5fb',
    'popover-foreground': '#1e293b',
    'popover-accent': '#7cc4f7',
    'popover-accent-foreground': '#1e293b',
};
const defaultSidebarColors: SidebarThemeColors = {
  'sidebar-background': '#dbeafb',
  'sidebar-foreground': '#1e293b',
  'sidebar-button-background': '#e8f1fa',
  'sidebar-accent': '#f1f5f9',
  'sidebar-accent-foreground': '#1e293b',
  'sidebar-border': '#94a3b8',
};
const defaultSidebarBackgroundImage = '';
const legacySidebarBackgroundImage = '';
const defaultHeaderColors: HeaderThemeColors = {
  'header-background': '#171514',
  'header-foreground': '#f3efe8',
  'header-border': '#3a312b',
  'header-button-background': '#ffffff',
  'header-button-foreground': '#1e293b',
  'header-button-border': '#cbd5e1',
  'header-button-hover': '#eef4fb',
};
const defaultSwimlaneColors: SwimlaneThemeColors = {
    'swimlane-header-background': '#f1f5f9',
    'swimlane-header-foreground': '#475569',
};
const defaultMatrixColors: MatrixThemeColors = {
    'matrix-header-background': '#e0f2fe',
    'matrix-header-foreground': '#1e293b',
    'matrix-subheader-background': '#f8fafc',
    'matrix-subheader-foreground': '#1e293b',
};
const defaultScale = 100;

// --- Helper Functions ---
const applyColorsToDOM = (colors: Record<string, string>) => {
  if (typeof window === 'undefined') return;
  Object.entries(colors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, hexToHsl(value as string));
  });
};

const applySidebarBackgroundImageToDOM = (value: string) => {
  if (typeof window === 'undefined') return;
  document.documentElement.style.setProperty(
    '--sidebar-background-image',
    value ? `url("${value}")` : 'none'
  );
};

const applyHeaderBackgroundImageToDOM = (value: string) => {
  if (typeof window === 'undefined') return;
  document.documentElement.style.setProperty(
    '--header-background-image',
    value ? `url("${value}")` : 'none'
  );
};

const applyCssNumberToDOM = (key: string, value: number) => {
  if (typeof window === 'undefined') return;
  document.documentElement.style.setProperty(key, String(value));
};

const applyScaleToDOM = (scale: number) => {
    if (typeof window === 'undefined') return;
    document.documentElement.style.fontSize = `${scale}%`;
};

function getInitialState<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') {
        return defaultValue;
    }
    try {
        const item = window.localStorage.getItem(key);
        if (item === null) {
            return defaultValue;
        }
        const trimmed = item.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('"') && trimmed !== 'null' && trimmed !== 'true' && trimmed !== 'false' && !/^[-\d]/.test(trimmed)) {
            return defaultValue;
        }
        const stored = JSON.parse(trimmed);

        // Strict picking: only allow keys that exist in the default definition
        if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
             const result: Record<string, unknown> = { ...(defaultValue as Record<string, unknown>) };
             Object.keys(defaultValue).forEach((k) => {
                 if (stored[k] !== undefined) {
                     result[k] = stored[k];
                 }
             });
             return result as T;
        }
        
        return stored as T;
    } catch (error) {
        console.warn(`Error reading localStorage key “${key}”:`, error);
        return defaultValue;
    }
}

const getSavedThemesStorageKey = (tenantId: string | null | undefined) =>
  tenantId ? `${SAVED_THEMES_KEY}:${tenantId}` : SAVED_THEMES_KEY;

const getBootstrapThemeSnapshot = (): BootstrapThemeSnapshot | null => {
  if (typeof window === 'undefined') return null;
  return window.__SAFEVIATE_THEME_BOOTSTRAP__ || null;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname?.startsWith(`${route}/`));
  const [theme, setTheme] = useState<ThemeColors>(() => ({
    ...defaultColors,
    ...(getBootstrapThemeSnapshot()?.theme?.main || {}),
  }));
  const [buttonTheme, setButtonTheme] = useState<ButtonThemeColors>(() => ({
    ...defaultButtonColors,
    ...(getBootstrapThemeSnapshot()?.theme?.button || {}),
  }));
  const [cardTheme, setCardTheme] = useState<CardThemeColors>(() => ({
    ...defaultCardColors,
    ...(getBootstrapThemeSnapshot()?.theme?.card || {}),
  }));
  const [popoverTheme, setPopoverTheme] = useState<PopoverThemeColors>(() => ({
    ...defaultPopoverColors,
    ...(getBootstrapThemeSnapshot()?.theme?.popover || {}),
  }));
  const [sidebarTheme, setSidebarTheme] = useState<SidebarThemeColors>(() => ({
    ...defaultSidebarColors,
    ...(getBootstrapThemeSnapshot()?.theme?.sidebar || {}),
  }));
  const [sidebarBackgroundImage, setSidebarBackgroundImageState] = useState<string>(
    () => (getBootstrapThemeSnapshot()?.theme?.sidebarBackgroundImage as string | undefined) || defaultSidebarBackgroundImage
  );
  const [sidebarBackgroundOpacity, setSidebarBackgroundOpacityState] = useState<number>(
    () => (getBootstrapThemeSnapshot()?.theme?.sidebarBackgroundOpacity as number | undefined) ?? 0.2
  );
  const [sidebarLogoImage, setSidebarLogoImageState] = useState<string>(
    () => (getBootstrapThemeSnapshot()?.theme?.sidebarLogoImage as string | undefined) || ''
  );
  const [sidebarLogoBackgroundColor, setSidebarLogoBackgroundColorState] = useState<string>(
    () => (getBootstrapThemeSnapshot()?.theme?.sidebarLogoBackgroundColor as string | undefined) || ''
  );
  const [headerTheme, setHeaderTheme] = useState<HeaderThemeColors>(() => ({
    ...defaultHeaderColors,
    ...(getBootstrapThemeSnapshot()?.theme?.header || {}),
  }));
  const [headerBackgroundImage, setHeaderBackgroundImageState] = useState<string>(
    () => (getBootstrapThemeSnapshot()?.theme?.headerBackgroundImage as string | undefined) || ''
  );
  const [headerBackgroundOpacity, setHeaderBackgroundOpacityState] = useState<number>(
    () => (getBootstrapThemeSnapshot()?.theme?.headerBackgroundOpacity as number | undefined) ?? 0.22
  );
  const [swimlaneTheme, setSwimlaneTheme] = useState<SwimlaneThemeColors>(() => ({
    ...defaultSwimlaneColors,
    ...(getBootstrapThemeSnapshot()?.theme?.swimlane || {}),
  }));
  const [matrixTheme, setMatrixTheme] = useState<MatrixThemeColors>(() => ({
    ...defaultMatrixColors,
    ...(getBootstrapThemeSnapshot()?.theme?.matrix || {}),
  }));
  const [uiMode, setUiModeState] = useState<UiMode>('classic');
  const [scale, setScaleState] = useState<number>(
    () => (getBootstrapThemeSnapshot()?.theme?.scale as number | undefined) ?? defaultScale
  );
  // Browser-only presets for the current tenant, separate from shared tenant branding.
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]);

  const { tenant, tenantId } = useTenantConfig();

  const resolveSidebarBackgroundImage = (value: string | null | undefined) => {
    if (!value) return '';
    return value;
  };

  const resolveSidebarLogoImage = (value: string | null | undefined) => {
    if (!value) return '';
    return value;
  };

  const resolveSidebarLogoBackgroundColor = (value: string | null | undefined) => {
    if (!value) return '';
    return value;
  };

  const resolveHeaderBackgroundImage = (value: string | null | undefined) => {
    if (!value) return '';
    return value;
  };

  const resolveOpacity = (value: unknown, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value));
    }
    return fallback;
  };

  const resolveScale = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return defaultScale;
  };

  const normalizeMatrixTheme = (source: Record<string, string> | undefined | null): MatrixThemeColors => ({
    ...defaultMatrixColors,
    'matrix-header-background': source?.['matrix-header-background'] || source?.['matrix-header-start'] || defaultMatrixColors['matrix-header-background'],
    'matrix-header-foreground': source?.['matrix-header-foreground'] || defaultMatrixColors['matrix-header-foreground'],
    'matrix-subheader-background': source?.['matrix-subheader-background'] || source?.['matrix-subheader-start'] || defaultMatrixColors['matrix-subheader-background'],
    'matrix-subheader-foreground': source?.['matrix-subheader-foreground'] || defaultMatrixColors['matrix-subheader-foreground'],
  });

  // --- Auto-sync with shared tenant branding ---
  useEffect(() => {
    if (!tenant?.theme) {
      return;
    }

    if (isAuthRoute) {
      return;
    }

    const nextTheme = {
      ...defaultColors,
      ...(tenant?.theme?.main || {}),
    };
    const nextButtonTheme = {
      ...defaultButtonColors,
      ...(tenant?.theme?.button || {}),
    };
    const nextCardTheme = {
      ...defaultCardColors,
      ...(tenant?.theme?.card || {}),
    };
    const nextPopoverTheme = {
      ...defaultPopoverColors,
      ...(tenant?.theme?.popover || {}),
    };
    const nextSidebarTheme = {
      ...defaultSidebarColors,
      ...(tenant?.theme?.sidebar || {}),
    };
    const nextHeaderTheme = {
      ...defaultHeaderColors,
      ...(tenant?.theme?.header || {}),
    };
    const nextHeaderBackgroundImage = resolveHeaderBackgroundImage(
      tenant?.theme?.headerBackgroundImage
    );
    const nextSidebarBackgroundOpacity = resolveOpacity(
      tenant?.theme?.sidebarBackgroundOpacity,
      0.2
    );
    const nextSidebarLogoBackgroundColor = resolveSidebarLogoBackgroundColor(
      tenant?.theme?.sidebarLogoBackgroundColor
    );
    const nextHeaderBackgroundOpacity = resolveOpacity(
      tenant?.theme?.headerBackgroundOpacity,
      0.22
    );
    const nextSwimlaneTheme = {
      ...defaultSwimlaneColors,
      ...(tenant?.theme?.swimlane || {}),
    };
    const nextMatrixTheme = normalizeMatrixTheme({
      ...(tenant?.theme?.matrix || {}),
    });
    const nextSidebarBackgroundImage = resolveSidebarBackgroundImage(
      tenant?.theme?.sidebarBackgroundImage
    );
    const localScale = getInitialState<number>(SCALE_KEY, defaultScale);
    const nextScale = isAuthRoute
      ? defaultScale
      : resolveScale(tenant?.theme?.scale) !== defaultScale
        ? resolveScale(tenant?.theme?.scale)
        : localScale;
    const nextSavedThemes = getInitialState<SavedTheme[]>(
      getSavedThemesStorageKey(tenantId),
      []
    );

    setTheme(nextTheme);
    setButtonTheme(nextButtonTheme);
    setCardTheme(nextCardTheme);
    setPopoverTheme(nextPopoverTheme);
    setSidebarTheme(nextSidebarTheme);
    setSidebarBackgroundImageState(nextSidebarBackgroundImage);
    setSidebarBackgroundOpacityState(nextSidebarBackgroundOpacity);
    setSidebarLogoImageState(
      resolveSidebarLogoImage(tenant?.theme?.sidebarLogoImage)
    );
    setSidebarLogoBackgroundColorState(nextSidebarLogoBackgroundColor);
    setHeaderTheme(nextHeaderTheme);
    setHeaderBackgroundImageState(nextHeaderBackgroundImage);
    setHeaderBackgroundOpacityState(nextHeaderBackgroundOpacity);
    setSwimlaneTheme(nextSwimlaneTheme);
    setMatrixTheme(nextMatrixTheme);
    setUiModeState('classic');
    setScaleState(nextScale);
  }, [isAuthRoute, tenant?.theme]);

  useEffect(() => {
    const nextSavedThemes = getInitialState<SavedTheme[]>(
      getSavedThemesStorageKey(tenantId),
      []
    );
    setSavedThemes(nextSavedThemes);
  }, [tenantId]);

  useEffect(() => {
    applyColorsToDOM(theme);
    applyColorsToDOM(buttonTheme);
    applyColorsToDOM(cardTheme);
    applyColorsToDOM(popoverTheme);
    applyColorsToDOM(sidebarTheme);
    applySidebarBackgroundImageToDOM(sidebarBackgroundImage);
    applyCssNumberToDOM('--sidebar-background-opacity', sidebarBackgroundOpacity);
    applyColorsToDOM(headerTheme);
    applyHeaderBackgroundImageToDOM(headerBackgroundImage);
    applyCssNumberToDOM('--header-background-opacity', headerBackgroundOpacity);
    applyColorsToDOM(swimlaneTheme);
    applyColorsToDOM(matrixTheme);
    applyScaleToDOM(isAuthRoute ? defaultScale : scale);
  }, [theme, buttonTheme, cardTheme, popoverTheme, sidebarTheme, sidebarBackgroundImage, sidebarBackgroundOpacity, headerTheme, headerBackgroundImage, headerBackgroundOpacity, swimlaneTheme, matrixTheme, scale, isAuthRoute]);
  

  const updateTheme = <T extends object>(
    state: T,
    setter: React.Dispatch<React.SetStateAction<T>>,
    prop: keyof T,
    value: string
  ) => {
    const newTheme = { ...state, [prop]: value };
    setter(newTheme);
    document.documentElement.style.setProperty(`--${String(prop)}`, hexToHsl(value));
  };

  const setUiMode = (_mode: UiMode) => {
    setUiModeState('classic');
  };

  const setScale = (newScale: number) => {
    setScaleState(newScale);
    try {
      window.localStorage.setItem(SCALE_KEY, JSON.stringify(newScale));
    } catch {
      // Ignore browser storage failures and keep the in-memory value.
    }
    applyScaleToDOM(newScale);
  };
  
  const setThemeValue = (prop: keyof ThemeColors, value: string) => updateTheme(theme, setTheme, prop, value);
  const setButtonThemeValue = (prop: keyof ButtonThemeColors, value: string) => updateTheme(buttonTheme, setButtonTheme, prop, value);
  const setCardThemeValue = (prop: keyof CardThemeColors, value: string) => updateTheme(cardTheme, setCardTheme, prop, value);
  const setPopoverThemeValue = (prop: keyof PopoverThemeColors, value: string) => updateTheme(popoverTheme, setPopoverTheme, prop, value);
  const setSidebarThemeValue = (prop: keyof SidebarThemeColors, value: string) => updateTheme(sidebarTheme, setSidebarTheme, prop, value);
  const setSidebarBackgroundImage = (value: string) => {
    setSidebarBackgroundImageState(value);
    applySidebarBackgroundImageToDOM(value);
  };
  const setSidebarBackgroundOpacity = (value: number) => {
    setSidebarBackgroundOpacityState(value);
    applyCssNumberToDOM('--sidebar-background-opacity', value);
  };
  const setSidebarLogoImage = (value: string) => {
    setSidebarLogoImageState(value);
  };
  const setSidebarLogoBackgroundColor = (value: string) => {
    setSidebarLogoBackgroundColorState(value);
  };
  const setHeaderThemeValue = (prop: keyof HeaderThemeColors, value: string) => updateTheme(headerTheme, setHeaderTheme, prop, value);
  const setHeaderBackgroundImage = (value: string) => {
    setHeaderBackgroundImageState(value);
    applyHeaderBackgroundImageToDOM(value);
  };
  const setHeaderBackgroundOpacity = (value: number) => {
    setHeaderBackgroundOpacityState(value);
    applyCssNumberToDOM('--header-background-opacity', value);
  };
  const setSwimlaneThemeValue = (prop: keyof SwimlaneThemeColors, value: string) => updateTheme(swimlaneTheme, setSwimlaneTheme, prop, value);
  const setMatrixThemeValue = (prop: keyof MatrixThemeColors, value: string) => updateTheme(matrixTheme, setMatrixTheme, prop, value);


  const applySavedTheme = (themeToApply: SavedTheme) => {
    const newTheme = { ...defaultColors, ...themeToApply.colors };
    const newButtonTheme = { ...defaultButtonColors, ...themeToApply.buttonColors };
    const newCardTheme = { ...defaultCardColors, ...themeToApply.cardColors };
    
    // Strict picking for sidebar and popover to avoid redundant keys
    const newPopoverTheme: PopoverThemeColors = { ...defaultPopoverColors };
    (Object.keys(defaultPopoverColors) as Array<keyof PopoverThemeColors>).forEach((k) => {
        if (themeToApply.popoverColors[k]) newPopoverTheme[k] = themeToApply.popoverColors[k];
    });

    const newSidebarTheme: SidebarThemeColors = { ...defaultSidebarColors };
    (Object.keys(defaultSidebarColors) as Array<keyof SidebarThemeColors>).forEach((k) => {
        if (themeToApply.sidebarColors[k]) newSidebarTheme[k] = themeToApply.sidebarColors[k];
    });
    const newSidebarBackgroundImage = resolveSidebarBackgroundImage(
      themeToApply.sidebarBackgroundImage
    );
    const newSidebarBackgroundOpacity = resolveOpacity(
      themeToApply.sidebarBackgroundOpacity,
      0.2
    );
    const newSidebarLogoImage = '';
    const newSidebarLogoBackgroundColor = resolveSidebarLogoBackgroundColor(
      themeToApply.sidebarLogoBackgroundColor
    );
    const newHeaderBackgroundImage = resolveHeaderBackgroundImage(
      themeToApply.headerBackgroundImage
    );
    const newHeaderBackgroundOpacity = resolveOpacity(
      themeToApply.headerBackgroundOpacity,
      0.22
    );

    const newHeaderTheme = { ...defaultHeaderColors, ...themeToApply.headerColors };
    const newSwimlaneTheme = { ...defaultSwimlaneColors, ...themeToApply.swimlaneColors };
    const newMatrixTheme = normalizeMatrixTheme(themeToApply.matrixColors);
    const newScale = themeToApply.scale || defaultScale;

    setTheme(newTheme);
    setButtonTheme(newButtonTheme);
    setCardTheme(newCardTheme);
    setPopoverTheme(newPopoverTheme);
    setSidebarTheme(newSidebarTheme);
    setSidebarBackgroundImageState(newSidebarBackgroundImage);
    setSidebarBackgroundOpacityState(newSidebarBackgroundOpacity);
    setSidebarLogoImageState(newSidebarLogoImage);
    setSidebarLogoBackgroundColorState(newSidebarLogoBackgroundColor);
    setHeaderTheme(newHeaderTheme);
    setHeaderBackgroundImageState(newHeaderBackgroundImage);
    setHeaderBackgroundOpacityState(newHeaderBackgroundOpacity);
    setSwimlaneTheme(newSwimlaneTheme);
    setMatrixTheme(newMatrixTheme);
    setUiModeState('classic');
    setScaleState(newScale);
    
    applyColorsToDOM(newTheme);
    applyColorsToDOM(newButtonTheme);
    applyColorsToDOM(newCardTheme);
    applyColorsToDOM(newPopoverTheme);
    applyColorsToDOM(newSidebarTheme);
    applySidebarBackgroundImageToDOM(newSidebarBackgroundImage);
    applyCssNumberToDOM('--sidebar-background-opacity', newSidebarBackgroundOpacity);
    applyColorsToDOM(newHeaderTheme);
    applyHeaderBackgroundImageToDOM(newHeaderBackgroundImage);
    applyCssNumberToDOM('--header-background-opacity', newHeaderBackgroundOpacity);
    applyColorsToDOM(newSwimlaneTheme);
    applyColorsToDOM(newMatrixTheme);
    applyScaleToDOM(newScale);
  };

  const saveCurrentTheme = (name: string) => {
    const newTheme: SavedTheme = {
      name,
      colors: theme,
      buttonColors: buttonTheme,
      cardColors: cardTheme,
      popoverColors: popoverTheme,
      sidebarColors: sidebarTheme,
      sidebarBackgroundImage,
      sidebarBackgroundOpacity,
      sidebarLogoImage,
      sidebarLogoBackgroundColor,
      headerColors: headerTheme,
      headerBackgroundImage,
      headerBackgroundOpacity,
      swimlaneColors: swimlaneTheme,
      matrixColors: matrixTheme,
      scale,
    };
    const updatedSavedThemes = [...savedThemes, newTheme];
    setSavedThemes(updatedSavedThemes);
    try {
      window.localStorage.setItem(getSavedThemesStorageKey(tenantId), JSON.stringify(updatedSavedThemes));
    } catch {
      // Ignore storage failures (private mode, quota limits, restricted browsers).
    }
  };
  
  const deleteSavedTheme = (name: string) => {
      const updatedSavedThemes = savedThemes.filter(t => t.name !== name);
      setSavedThemes(updatedSavedThemes);
      try {
        window.localStorage.setItem(getSavedThemesStorageKey(tenantId), JSON.stringify(updatedSavedThemes));
      } catch {
        // Ignore storage failures (private mode, quota limits, restricted browsers).
      }
  }

  const resetToDefaults = () => {
    setTheme({
      ...defaultColors,
      ...(tenant?.theme?.main || {}),
    });
    setButtonTheme({
      ...defaultButtonColors,
      ...(tenant?.theme?.button || {}),
    });
    setCardTheme({
      ...defaultCardColors,
      ...(tenant?.theme?.card || {}),
    });
    setPopoverTheme({
      ...defaultPopoverColors,
      ...(tenant?.theme?.popover || {}),
    });
    setSidebarTheme({
      ...defaultSidebarColors,
      ...(tenant?.theme?.sidebar || {}),
    });
    setSidebarBackgroundImageState(
      resolveSidebarBackgroundImage(tenant?.theme?.sidebarBackgroundImage)
    );
    setSidebarBackgroundOpacityState(
      resolveOpacity(tenant?.theme?.sidebarBackgroundOpacity, 0.2)
    );
    setSidebarLogoImageState(
      resolveSidebarLogoImage(tenant?.theme?.sidebarLogoImage)
    );
    setSidebarLogoBackgroundColorState(
      resolveSidebarLogoBackgroundColor(tenant?.theme?.sidebarLogoBackgroundColor)
    );
    setHeaderTheme({
      ...defaultHeaderColors,
      ...(tenant?.theme?.header || {}),
    });
    setHeaderBackgroundImageState(
      resolveHeaderBackgroundImage(tenant?.theme?.headerBackgroundImage)
    );
    setHeaderBackgroundOpacityState(
      resolveOpacity(tenant?.theme?.headerBackgroundOpacity, 0.22)
    );
    setSwimlaneTheme({
      ...defaultSwimlaneColors,
      ...(tenant?.theme?.swimlane || {}),
    });
    setMatrixTheme(normalizeMatrixTheme(tenant?.theme?.matrix || {}));
    setUiModeState('classic');
    const nextScale = resolveScale(tenant?.theme?.scale);
    setScaleState(nextScale);
    try {
      window.localStorage.setItem(SCALE_KEY, JSON.stringify(nextScale));
    } catch {
      // Ignore browser storage failures and keep the in-memory value.
    }
    window.location.reload();
  };

  const value = {
    theme,
    setThemeValue,
    buttonTheme,
    setButtonThemeValue,
    cardTheme,
    setCardThemeValue,
    popoverTheme,
    setPopoverThemeValue,
    sidebarTheme,
    setSidebarThemeValue,
    sidebarBackgroundImage,
    setSidebarBackgroundImage,
    sidebarBackgroundOpacity,
    setSidebarBackgroundOpacity,
    sidebarLogoImage,
    setSidebarLogoImage,
    sidebarLogoBackgroundColor,
    setSidebarLogoBackgroundColor,
    headerTheme,
    setHeaderThemeValue,
    headerBackgroundImage,
    setHeaderBackgroundImage,
    headerBackgroundOpacity,
    setHeaderBackgroundOpacity,
    swimlaneTheme,
    setSwimlaneThemeValue,
    matrixTheme,
    setMatrixThemeValue,
    uiMode,
    setUiMode,
    scale,
    setScale,
    savedThemes,
    saveCurrentTheme,
    applySavedTheme,
    deleteSavedTheme,
    resetToDefaults,
  };

  return (
    <ThemeContext.Provider value={value}>
        {children}
    </ThemeContext.Provider>
  );
};
