import { Args, Command, Flags } from '@oclif/core';
import { isSuccess } from '../lib/client.js';
import { output, log } from '../lib/formatter.js';
import { requireDangerAcknowledgement } from '../lib/danger.js';
import { findBridgeRoot, runCommand, sortableId, type CommandJson } from '../lib/fs-bridge.js';
import chalk from 'chalk';

export default class Exec extends Command {
  static description = 'Execute arbitrary JavaScript in VS Code (DANGER MODE)';

  static examples = [
    '<%= config.bin %> <%= command.id %> "vscode.window.showInformationMessage(\'Hello\')"',
    '<%= config.bin %> <%= command.id %> --file ./script.js --yes',
  ];

  static flags = {
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip danger mode confirmation',
      default: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Read script from file',
      exclusive: ['script'],
    }),
    timeout: Flags.integer({
      description: 'Request timeout in milliseconds',
      default: 30000,
    }),
    verbose: Flags.boolean({
      description: 'Enable verbose logging (shows pickup duration)',
      default: false,
    }),
  };

  static args = {
    script: Args.string({
      description: 'JavaScript code to execute',
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Exec);

    // Get script content
    let script: string;
    if (flags.file) {
      const fs = await import('fs-extra');
      script = await fs.readFile(flags.file, 'utf-8');
    } else if (args.script) {
      script = args.script;
    } else {
      this.error('Either provide a script as argument or use --file flag');
    }

    // Show danger warning
    console.error(chalk.red('═══════════════════════════════════════'));
    console.error(chalk.red('           DANGER MODE ACTIVE          '));
    console.error(chalk.red('═══════════════════════════════════════'));
    console.error('');

    // Require acknowledgement
    try {
      await requireDangerAcknowledgement({ force: flags.yes });
    } catch (error: any) {
      this.error(error.message);
    }

    log('Executing script...');

    // Execute via the danger mode script
    const bridgeRoot = await findBridgeRoot();
    const command: CommandJson = {
      version: 1,
      clientId: `cli-${process.pid}`,
      id: sortableId(Date.now()),
      createdAt: new Date().toISOString(),
      scriptName: 'danger.execute',
      params: {
        script,
        timeout: flags.timeout
      },
      timeout: flags.timeout
    };
    const response = await runCommand(bridgeRoot, command, { timeout: flags.timeout, verbose: flags.verbose });

    // Handle response
    if (!isSuccess(response)) {
      // Check if it's because danger mode is not enabled on server
      const error = (response as any).error;
      if (error?.code === 'E_DANGER_MODE_REQUIRED') {
        console.error('');
        console.error(chalk.red('Error: Danger mode is not enabled in VS Code'));
        console.error('');
        console.error('To enable danger mode:');
        console.error('  1. Open VS Code settings (Cmd+, or Ctrl+,)');
        console.error('  2. Search for "vscBridge.dangerMode"');
        console.error('  3. Check the box to enable danger mode');
        console.error('  4. Try running this command again');
        console.error('');
        process.exit(1);
      }
    }

    await output(response, { format: flags.json ? 'json' : 'pretty' });
  }
}