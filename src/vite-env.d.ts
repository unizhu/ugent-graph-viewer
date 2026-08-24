/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Comma-separated console origins this build will accept a handoff
   * from. Empty (the default) accepts any origin that is also this tab's
   * opener; see `handoff/isAllowedConsoleOrigin`.
   */
  readonly VITE_CONSOLE_ORIGINS?: string;
}

interface ImportMeta {
  // Optional: absent when modules are imported outside a Vite build,
  // which is how the standalone tsx tests run them.
  readonly env?: ImportMetaEnv;
}
