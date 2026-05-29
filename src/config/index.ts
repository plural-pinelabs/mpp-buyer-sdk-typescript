export const P3PEnvironment = {
  SANDBOX: "https://pluraluat.v2.pinepg.in",
  PRODUCTION: "https://api.pluralpay.in",
} as const;

export type P3PEnvironmentValue = typeof P3PEnvironment[keyof typeof P3PEnvironment];

export function isP3PEnvironment(value: unknown): value is P3PEnvironmentValue {
  return value === P3PEnvironment.SANDBOX || value === P3PEnvironment.PRODUCTION;
}

export function resolveP3PBaseUrl(env: P3PEnvironmentValue | undefined = P3PEnvironment.PRODUCTION): string {
  if (!isP3PEnvironment(env)) {
    throw new Error("env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
  }
  return env;
}

export const DEFAULT_BASE_URL = P3PEnvironment.PRODUCTION;
