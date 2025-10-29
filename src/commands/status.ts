import { Command, Flags } from '@oclif/core';
import { findBridgeRoot, checkBridgeHealth } from '../lib/fs-bridge.js';
import { log } from '../lib/formatter.js';
import chalk from 'chalk';

export default class Status extends Command {
  static description = 'Check VSC-Bridge connection status';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static flags = {
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Status);

    try {
      const bridgeRoot = await findBridgeRoot();
      const health = await checkBridgeHealth(bridgeRoot);

      if (flags.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      // Pretty output
      if (health.healthy) {
        const lastSeenAgo = health.lastSeen
          ? Math.round((Date.now() - health.lastSeen.getTime()) / 1000)
          : null;

        console.log(chalk.green('✓') + ' VSC-Bridge is healthy');

        if (lastSeenAgo !== null) {
          if (lastSeenAgo < 5) {
            console.log(`  Last activity: just now`);
          } else if (lastSeenAgo < 60) {
            console.log(`  Last activity: ${lastSeenAgo} seconds ago`);
          } else {
            const minutes = Math.round(lastSeenAgo / 60);
            console.log(`  Last activity: ${minutes} minute${minutes === 1 ? '' : 's'} ago`);
          }
        }

        console.log(`  Transport: Filesystem bridge`);
      } else {
        console.log(chalk.red('✗') + ' VSC-Bridge is not responding');

        if (health.lastSeen) {
          const lastSeenAgo = Math.round((Date.now() - health.lastSeen.getTime()) / 1000);
          const minutes = Math.round(lastSeenAgo / 60);

          if (lastSeenAgo > 60) {
            console.log(`  Last seen: ${minutes} minute${minutes === 1 ? '' : 's'} ago`);
          } else {
            console.log(`  Last seen: ${lastSeenAgo} seconds ago`);
          }
        }

        console.log('\nTroubleshooting:');
        console.log('  1. Ensure VS Code is open with a workspace');
        console.log('  2. Check that the VSC-Bridge extension is installed and enabled');
        console.log('  3. Look for .vsc-bridge/ folder in your workspace root');
        console.log('\nTo install the VS Code extension:');
        console.log('  npx github:AI-Substrate/wormhole get-vsix --install');
        console.log('\nOr download manually:');
        console.log('  npx github:AI-Substrate/wormhole get-vsix');
        process.exit(1);
      }
    } catch (error: any) {
      if (flags.json) {
        console.log(JSON.stringify({
          healthy: false,
          error: error.message
        }, null, 2));
      } else {
        console.error(chalk.red('Error:'), error.message);
      }
      process.exit(1);
    }
  }
}