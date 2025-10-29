import { Args, Command, Flags } from '@oclif/core';
import {
  readConfig,
  writeConfig,
  setConfigValue,
  resetConfig,
  getConfigPath,
} from '../lib/config.js';
import chalk from 'chalk';

export default class Config extends Command {
  static description = 'Manage VSC-Bridge CLI configuration';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> get authToken',
    '<%= config.bin %> <%= command.id %> set authToken abc123',
    '<%= config.bin %> <%= command.id %> set serverUrl http://localhost:3001',
    '<%= config.bin %> <%= command.id %> reset',
  ];

  static flags = {
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  static args = {
    action: Args.string({
      description: 'Action to perform',
      required: false,
      options: ['get', 'set', 'reset'],
    }),
    key: Args.string({
      description: 'Configuration key',
      required: false,
    }),
    value: Args.string({
      description: 'Configuration value (for set action)',
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Config);

    // No action = show all config
    if (!args.action) {
      await this.showConfig(flags);
      return;
    }

    switch (args.action) {
      case 'get':
        if (!args.key) {
          this.error('Key is required for get action');
        }
        await this.getConfig(args.key, flags);
        break;

      case 'set':
        if (!args.key || args.value === undefined) {
          this.error('Key and value are required for set action');
        }
        await this.setConfig(args.key, args.value);
        break;

      case 'reset':
        await this.resetConfiguration();
        break;

      default:
        this.error(`Unknown action: ${args.action}`);
    }
  }

  private async showConfig(flags: any): Promise<void> {
    const config = await readConfig();

    if (flags.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.error(chalk.bold('VSC-Bridge CLI Configuration'));
      console.error(chalk.gray(`Location: ${getConfigPath()}`));
      console.error('');
      console.error('Current settings:');
      for (const [key, value] of Object.entries(config)) {
        const displayValue = key === 'authToken' && value
          ? (value as string).substring(0, 8) + '...'
          : value;
        console.error(`  ${chalk.cyan(key)}: ${displayValue}`);
      }
    }
  }

  private async getConfig(key: string, flags: any): Promise<void> {
    const config = await readConfig();
    const value = (config as any)[key];

    if (value === undefined) {
      this.error(`Unknown configuration key: ${key}`);
    }

    if (flags.json) {
      console.log(JSON.stringify({ [key]: value }, null, 2));
    } else {
      console.log(value);
    }
  }

  private async setConfig(key: string, value: string): Promise<void> {
    // Parse value based on key
    let parsedValue: any = value;

    if (key === 'dangerModeAcknowledged') {
      parsedValue = value === 'true';
    } else if (key === 'outputFormat') {
      if (!['json', 'pretty', 'auto'].includes(value)) {
        this.error('outputFormat must be one of: json, pretty, auto');
      }
    }

    try {
      await setConfigValue(key as any, parsedValue);
      console.error(chalk.green('✓'), `Set ${key} = ${parsedValue}`);
    } catch (error: any) {
      this.error(`Failed to set configuration: ${error.message}`);
    }
  }

  private async resetConfiguration(): Promise<void> {
    await resetConfig();
    console.error(chalk.green('✓'), 'Configuration reset to defaults');
    console.error(chalk.gray(`Location: ${getConfigPath()}`));
  }
}