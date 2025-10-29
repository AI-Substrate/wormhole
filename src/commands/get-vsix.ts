import { Command, Flags } from '@oclif/core';
import * as path from 'path';
import { stat } from 'fs/promises';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { GitHubClient, formatBytes } from '../lib/github.js';

export default class GetVsix extends Command {
  static description = 'Download VSIX extension from GitHub releases';

  static examples = [
    {
      description: 'Download latest stable release',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Download latest (including pre-releases)',
      command: '<%= config.bin %> <%= command.id %> --include-prerelease',
    },
    {
      description: 'Download specific version',
      command: '<%= config.bin %> <%= command.id %> --version v1.0.0',
    },
    {
      description: 'Download to specific directory',
      command: '<%= config.bin %> <%= command.id %> --output ~/Downloads',
    },
    {
      description: 'Download and install',
      command: '<%= config.bin %> <%= command.id %> --install',
    },
    {
      description: 'JSON output for scripting',
      command: '<%= config.bin %> <%= command.id %> --json',
    },
  ];

  static flags = {
    version: Flags.string({
      char: 'v',
      description: 'Specific version to download (default: latest)',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory (default: current directory)',
      required: false,
    }),
    install: Flags.boolean({
      char: 'i',
      description: 'Auto-install after download using code --install-extension',
      default: false,
    }),
    'include-prerelease': Flags.boolean({
      description: 'Include pre-releases when finding latest version',
      default: false,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetVsix);

    try {
      if (!flags.json) {
        this.log(chalk.cyan('🔍 vsc-bridge VSIX Downloader'));
        this.log(chalk.cyan('━'.repeat(45)));
      }

      const client = new GitHubClient();

      // Determine which release to fetch
      let release;
      if (flags.version) {
        if (!flags.json) {
          this.log(chalk.blue(`📦 Fetching release: ${flags.version}...`));
        }
        release = await client.getReleaseByTag(flags.version);
      } else {
        if (!flags.json) {
          const releaseType = flags['include-prerelease'] ? 'latest' : 'latest stable';
          this.log(chalk.blue(`📦 Fetching ${releaseType} release...`));
        }
        release = await client.getLatestRelease({
          includePrerelease: flags['include-prerelease'],
        });
      }

      if (!flags.json) {
        this.log(chalk.green(`✓ Found: ${release.tagName}`));
      }

      // Find VSIX asset
      const vsixAsset = client.findVsixAsset(release);
      if (!vsixAsset) {
        throw new Error(`No VSIX file found in release ${release.tagName}`);
      }

      // Determine output path
      const outputDir = flags.output ? path.resolve(flags.output) : process.cwd();
      const outputPath = path.join(outputDir, vsixAsset.name);

      // Ensure output directory exists
      await fs.ensureDir(outputDir);

      // Download
      if (!flags.json) {
        this.log('');
        this.log(chalk.blue('⬇️  Downloading VSIX...'));
      }

      const downloadedPath = await client.downloadAsset(release, vsixAsset.name, outputDir);

      if (!flags.json) {
        const stats = await stat(downloadedPath);
        this.log(chalk.green(`✓ Downloaded: ${vsixAsset.name} (${formatBytes(stats.size)})`));
        this.log(chalk.gray(`   Location: ${downloadedPath}`));
      }

      // Install if requested
      let installed = false;
      if (flags.install) {
        if (!flags.json) {
          this.log('');
          this.log(chalk.blue('📥 Installing extension...'));
        }

        try {
          // Check if code command is available
          execSync('code --version', { stdio: 'pipe' });

          // Install extension
          execSync(`code --install-extension "${downloadedPath}"`, { stdio: 'pipe' });

          installed = true;

          if (!flags.json) {
            this.log('');
            this.log(chalk.green('✅ Installation complete!'));
            this.log('');
            this.log('Extension: vsc-bridge');
            this.log(`Version: ${release.tagName.replace(/^v/, '')}`);
            this.log('ID: AI-Substrate.vsc-bridge-extension');
            this.log('');
            this.log(chalk.cyan('🔄 Reload VS Code for changes to take effect:'));
            this.log(chalk.gray('   Ctrl+Shift+P (or Cmd+Shift+P on Mac) → "Developer: Reload Window"'));
            this.log('');
            this.log(chalk.cyan('Then run:'));
            this.log(chalk.gray('   npx github:AI-Substrate/wormhole status'));
          }
        } catch (error: any) {
          if (error.message?.includes('code')) {
            throw new Error(
              'VS Code "code" command not found in PATH. Install it via: VS Code → Cmd+Shift+P → "Shell Command: Install code command in PATH"'
            );
          }
          throw new Error(`Installation failed: ${error.message}`);
        }
      }

      // Output results
      if (flags.json) {
        const stats = await stat(downloadedPath);
        this.log(
          JSON.stringify(
            {
              version: release.tagName.replace(/^v/, ''),
              filePath: downloadedPath,
              fileSize: stats.size,
              installed,
              installCommands: {
                cli: `code --install-extension ${downloadedPath}`,
                ui: 'Extensions view → ⋮ menu → Install from VSIX...',
              },
            },
            null,
            2
          )
        );
      } else if (!flags.install) {
        // Show installation instructions if not installed
        this.log('');
        this.log(chalk.blue('📥 Installation Options:'));
        this.log(chalk.cyan('━'.repeat(45)));
        this.log(chalk.bold('Command Line:'));
        this.log(chalk.gray(`  code --install-extension ${downloadedPath}`));
        this.log('');
        this.log(chalk.bold('From VS Code Editor:'));
        this.log(chalk.gray('  1. Open Extensions view (Ctrl+Shift+X / Cmd+Shift+X)'));
        this.log(chalk.gray('  2. Click ⋮ menu → "Install from VSIX..."'));
        this.log(chalk.gray(`  3. Select: ${vsixAsset.name}`));
        this.log(chalk.gray('  4. Reload VS Code when prompted'));
        this.log('');
        this.log(chalk.gray(`Or use: ${this.config.bin} get-vsix --install`));
      }
    } catch (error: any) {
      let errorMessage = error.message;
      let helpText = '';

      // Provide actionable error messages
      if (error.message?.includes('gh') && error.message?.includes('not found')) {
        helpText = '\n\nInstall GitHub CLI:\n' +
                   '  • macOS: brew install gh\n' +
                   '  • Linux: https://github.com/cli/cli/blob/trunk/docs/install_linux.md\n' +
                   '  • Windows: winget install GitHub.cli';
      } else if (error.message?.includes('not authenticated')) {
        helpText = '\n\nAuthenticate with GitHub:\n' +
                   '  gh auth login';
      } else if (error.message?.includes('code') && error.message?.includes('not found')) {
        helpText = '\n\nInstall VS Code CLI:\n' +
                   '  • Open VS Code → Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows/Linux)\n' +
                   '  • Type: "Shell Command: Install \'code\' command in PATH"\n' +
                   '  • Select and run the command';
      } else if (error.message?.includes('Release not found')) {
        helpText = '\n\nCheck available releases:\n' +
                   '  gh release list --repo AI-Substrate/wormhole';
      }

      if (flags.json) {
        this.log(
          JSON.stringify(
            {
              error: errorMessage,
              help: helpText.trim(),
            },
            null,
            2
          )
        );
        this.exit(1);
      }

      this.error(chalk.red(`❌ Error: ${errorMessage}${helpText}`), { exit: 1 });
    }
  }
}
