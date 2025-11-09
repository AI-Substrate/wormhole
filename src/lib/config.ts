import fs from 'fs-extra';
import * as path from 'path';
import { z } from 'zod';
import os from 'os';

// Configuration schema
const ConfigSchema = z.object({
  authToken: z.string().optional(),
  outputFormat: z.enum(['json', 'pretty', 'auto']).default('json'),
  dangerModeAcknowledged: z.boolean().default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// Config file location
const configDir = path.join(os.homedir(), '.vscbridge');
const configFile = path.join(configDir, 'config.json');

/**
 * Read configuration from disk
 */
export async function readConfig(): Promise<AppConfig> {
  await fs.ensureDir(configDir);

  if (!(await fs.pathExists(configFile))) {
    // Create default config
    const defaultConfig = ConfigSchema.parse({});
    await fs.writeJson(configFile, defaultConfig, { spaces: 2 });
    return defaultConfig;
  }

  try {
    const raw = await fs.readJson(configFile);
    return ConfigSchema.parse(raw);
  } catch (error) {
    // If config is invalid, reset to defaults
    console.error('Invalid config file, resetting to defaults');
    const defaultConfig = ConfigSchema.parse({});
    await fs.writeJson(configFile, defaultConfig, { spaces: 2 });
    return defaultConfig;
  }
}

/**
 * Write configuration to disk
 */
export async function writeConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  const current = await readConfig();
  const merged = ConfigSchema.parse({ ...current, ...updates });
  await fs.writeJson(configFile, merged, { spaces: 2 });
  return merged;
}

/**
 * Get a single config value
 */
export async function getConfigValue<K extends keyof AppConfig>(
  key: K
): Promise<AppConfig[K]> {
  const config = await readConfig();
  return config[key];
}

/**
 * Set a single config value
 */
export async function setConfigValue<K extends keyof AppConfig>(
  key: K,
  value: AppConfig[K]
): Promise<void> {
  await writeConfig({ [key]: value });
}

/**
 * Reset config to defaults
 */
export async function resetConfig(): Promise<AppConfig> {
  const defaultConfig = ConfigSchema.parse({});
  await fs.writeJson(configFile, defaultConfig, { spaces: 2 });
  return defaultConfig;
}

/**
 * Get config file path (for debugging)
 */
export function getConfigPath(): string {
  return configFile;
}