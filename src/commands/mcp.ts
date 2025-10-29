import { Command, Flags } from '@oclif/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../lib/mcp/server.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * MCP command - starts MCP server for AI agent access to VSC-Bridge tools.
 *
 * This command launches the MCP server with stdio transport, enabling AI agents
 * (like Claude) to spawn the server as a subprocess and communicate via stdin/stdout.
 *
 * **Critical Design Constraints**:
 * - Stdout is SACRED: Only MCP protocol JSON-RPC messages on stdout
 * - All logging MUST go to stderr (use `this.log()` or `console.error()`)
 * - SIGINT handlers MUST be registered BEFORE `server.connect()` (which blocks)
 * - Workspace flag is REQUIRED for agent use (agents pass `--workspace $(pwd)`)
 *
 * @module cli/commands/mcp
 */
export default class Mcp extends Command {
  static description = 'Start MCP server for AI agent access to VSC-Bridge debugging tools';

  static examples = [
    '<%= config.bin %> <%= command.id %> --workspace /path/to/project',
    '<%= config.bin %> <%= command.id %> --workspace $(pwd)',
    '<%= config.bin %> <%= command.id %> --workspace /project --timeout 60000',
  ];

  static flags = {
    workspace: Flags.string({
      description: 'Workspace directory containing .vsc-bridge (REQUIRED for agents)',
      required: true, // Per Critical Insight #2: agents need this explicitly
      char: 'w',
    }),
    timeout: Flags.integer({
      description: 'Default timeout for tool execution in milliseconds',
      default: 30000,
      char: 't',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Mcp);

    try {
      // Per Critical Insight #4: Check CLI vs extension version compatibility
      await this.checkVersionCompatibility(flags.workspace);

      // Create server using factory (Critical Discovery 05 - factory pattern for testing)
      console.error('Starting VSC-Bridge MCP server...'); // stderr logging (Critical Insight #1)
      const server = createMcpServer({
        workspace: flags.workspace,
        timeout: flags.timeout,
      });

      // Create stdio transport (no args needed - uses process.stdin/stdout automatically)
      const transport = new StdioServerTransport();

      // Per Critical Insight #3: Register SIGINT/SIGTERM handlers BEFORE server.connect()
      // (server.connect() blocks indefinitely waiting for stdin to close)
      const shutdownHandler = async () => {
        console.error('\nShutting down MCP server...');
        try {
          await transport.close();
        } catch (error) {
          // Ignore close errors during shutdown
        }
        process.exit(0);
      };

      process.on('SIGINT', shutdownHandler);
      process.on('SIGTERM', shutdownHandler);

      // Connect server to stdio transport
      // This call BLOCKS until stdin closes (agent disconnects)
      await server.connect(transport);

      // This line only executes when stdin closes naturally (agent disconnects)
      console.error('MCP server stopped (stdin closed).');

    } catch (error) {
      // Enhanced error handling per T014 - provide actionable error messages
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Detect common failure scenarios and provide guidance
      if (errorMessage.includes('Bridge root not found') || errorMessage.includes('ENOENT') && errorMessage.includes('.vsc-bridge')) {
        this.error(
          `Failed to start MCP server: VS Code extension not running or workspace not initialized.\n\n` +
          `Troubleshooting:\n` +
          `  1. Ensure VS Code extension is running in workspace: ${flags.workspace}\n` +
          `  2. Open the workspace in VS Code to initialize .vsc-bridge directory\n` +
          `  3. Verify .vsc-bridge directory exists: ls -la "${flags.workspace}/.vsc-bridge"\n\n` +
          `To install the VS Code extension:\n` +
          `  npx github:AI-Substrate/wormhole get-vsix --install\n\n` +
          `Or download manually:\n` +
          `  npx github:AI-Substrate/wormhole get-vsix\n\n` +
          `Error: ${errorMessage}`,
          { exit: 1 }
        );
      } else if (errorMessage.includes('manifest') || errorMessage.includes('ENOENT')) {
        this.error(
          `Failed to start MCP server: Manifest not found.\n\n` +
          `Troubleshooting:\n` +
          `  1. Rebuild CLI: cd cli && npm run build\n` +
          `  2. Ensure manifest.json exists in CLI dist directory\n` +
          `  3. Verify CLI installation: which vscb\n\n` +
          `Error: ${errorMessage}`,
          { exit: 1 }
        );
      } else {
        // Generic error with full context
        this.error(`Failed to start MCP server: ${errorMessage}`, { exit: 1 });
      }
    }
  }

  /**
   * Check version compatibility between CLI and extension.
   * Per Critical Insight #4: Warn if versions drift (directional upgrade guidance).
   *
   * @param workspace - Workspace directory to check extension version
   */
  private async checkVersionCompatibility(workspace: string): Promise<void> {
    try {
      // Read CLI version from package.json (oclif provides this via config)
      const cliVersion = this.config.version;

      // Read extension version from workspace's host.json
      const hostJsonPath = path.join(workspace, '.vsc-bridge', 'host.json');

      if (!fs.existsSync(hostJsonPath)) {
        // Extension not initialized yet - skip version check
        return;
      }

      const hostJson = JSON.parse(fs.readFileSync(hostJsonPath, 'utf8'));
      const extensionVersion = hostJson.version;

      if (!extensionVersion) {
        // Old extension without version field - skip check
        return;
      }

      // Compare versions (simple string comparison, assumes semver format)
      if (cliVersion !== extensionVersion) {
        // Determine upgrade direction
        const cliNewer = this.compareVersions(cliVersion, extensionVersion) > 0;

        if (cliNewer) {
          this.warn(
            `⚠️  Version mismatch: CLI v${cliVersion} is ahead of extension v${extensionVersion}\n` +
            `    Please update your VS Code extension to match CLI version.\n` +
            `    Some tools may not work correctly until versions match.`
          );
        } else {
          this.warn(
            `⚠️  Version mismatch: CLI v${cliVersion} is behind extension v${extensionVersion}\n` +
            `    Please update your CLI: npm install -g @vsc-bridge/cli@latest\n` +
            `    Some tools may not be available until versions match.`
          );
        }
      }
    } catch (error) {
      // Version check is best-effort - don't fail if it errors
      // Silently skip if host.json doesn't exist or can't be read
    }
  }

  /**
   * Simple semver comparison (returns -1, 0, or 1).
   * @param v1 - First version string (e.g., "1.2.3")
   * @param v2 - Second version string
   * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }
}
