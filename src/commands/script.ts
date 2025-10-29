import { Args, Command, Flags } from '@oclif/core';
import { isSuccess } from '../lib/client.js';
import { output, log } from '../lib/formatter.js';
import { findBridgeRoot, runCommand, sortableId, type CommandJson } from '../lib/fs-bridge.js';
import { manifestLoader } from '../lib/manifest-loader.js';
import { validateParams, formatValidationErrors } from '../lib/param-validator.js';
import { discoverScripts, findScript } from '../lib/discoverScripts.js';
import { extractMetadata } from '../lib/extractMetadata.js';
import { isWSL, wslToWindows } from '../lib/wsl.js';
import * as fs from 'fs';
import * as path from 'path';

export default class Script extends Command {
  static description = 'List or run VSC-Bridge scripts';

  static examples = [
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> run bp.set --param path=/file.py --param line=10',
    '<%= config.bin %> <%= command.id %> run -f ./scripts/custom.js --param foo=bar',
    '<%= config.bin %> <%= command.id %> info bp.set',
  ];

  static flags = {
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
    param: Flags.string({
      description: 'Script parameter (key=value format)',
      multiple: true,
      char: 'p',
    }),
    file: Flags.string({
      description: 'Path to script file to run',
      char: 'f',
    }),
    timeout: Flags.integer({
      description: 'Request timeout in milliseconds',
      default: 30000,
    }),
    'no-validate': Flags.boolean({
      description: 'Skip parameter validation',
      default: false,
    }),
    verbose: Flags.boolean({
      description: 'Enable verbose logging (shows pickup duration)',
      default: false,
    }),
  };

  static args = {
    action: Args.string({
      description: 'Action to perform',
      required: true,
      options: ['list', 'run', 'info'],
    }),
    scriptName: Args.string({
      description: 'Name of the script to run (required for run/info action)',
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Script);

    if (args.action === 'list') {
      await this.listScripts(flags);
    } else if (args.action === 'run') {
      if (flags.file) {
        // Run a specific file
        await this.runScriptFile(flags.file, flags);
      } else if (args.scriptName) {
        // Run by name (built-in or discovered)
        await this.runScript(args.scriptName, flags);
      } else {
        this.error('Script name or -f/--file flag is required for run action');
      }
    } else if (args.action === 'info') {
      if (!args.scriptName) {
        this.error('Script name is required for info action');
      }
      await this.showScriptInfo(args.scriptName, flags);
    }
  }

  private async listScripts(flags: any): Promise<void> {
    // Discover dynamic scripts first
    const discoveredScripts = await discoverScripts();

    try {
      // Try to load manifest locally first
      const byCategory = manifestLoader.getScriptsByCategory();

      if (flags.json) {
        // Output as JSON including discovered scripts
        const scripts = manifestLoader.listScripts().map(alias => {
          const metadata = manifestLoader.getScriptMetadata(alias);
          return { alias, metadata, location: 'builtin' };
        });

        // Add discovered scripts
        const allScripts = [
          ...scripts,
          ...discoveredScripts.map(ds => ({
            alias: ds.name,
            metadata: {
              name: ds.name,
              description: ds.description,
              category: ds.category || 'custom',
              dangerOnly: ds.dangerOnly
            },
            location: ds.location
          }))
        ];

        console.log(JSON.stringify({ scripts: allScripts, byCategory }, null, 2));
      } else {
        // Pretty output
        console.error('\nAvailable Scripts:\n');

        // Show built-in scripts from manifest
        console.error('  === Built-in Scripts ===\n');
        for (const [category, scripts] of Object.entries(byCategory)) {
          console.error(`  ${category}:`);
          for (const script of scripts) {
            const desc = script.description || 'No description';
            const danger = script.dangerOnly ? ' [danger-only]' : '';
            console.error(`    • ${script.alias}${danger} - ${desc}`);

            // Show parameters if any
            if (script.params && Object.keys(script.params).length > 0) {
              for (const [name, def] of Object.entries(script.params)) {
                const req = def.required ? '*' : '';
                const defVal = def.default !== undefined ? ` (default: ${def.default})` : '';
                console.error(`        ${name}${req} (${def.type})${defVal}: ${def.description || 'No description'}`);
              }
            }
          }
          console.error('');
        }

        // Show discovered scripts
        if (discoveredScripts.length > 0) {
          console.error('  === Discovered Scripts ===\n');

          // Group by location
          const byLocation: Record<string, typeof discoveredScripts> = {};
          for (const script of discoveredScripts) {
            if (!byLocation[script.location]) {
              byLocation[script.location] = [];
            }
            byLocation[script.location].push(script);
          }

          for (const [location, scripts] of Object.entries(byLocation)) {
            console.error(`  ${location}:`);
            for (const script of scripts) {
              const danger = script.dangerOnly ? ' [danger-only]' : '';
              const params = script.hasParamsSchema ? ' [validated]' : '';
              console.error(`    • ${script.name}${danger}${params} - ${script.description}`);
            }
            console.error('');
          }
        }

        const manifestPath = manifestLoader.getLoadedPath();
        if (manifestPath) {
          console.error(`  Manifest loaded from: ${manifestPath}\n`);
        }
      }
    } catch (manifestError) {
      // Fallback to extension if manifest not found
      log('Manifest not found locally, fetching from extension...');

      const bridgeRoot = await findBridgeRoot();
      const command: CommandJson = {
        version: 1,
        clientId: `cli-${process.pid}`,
        id: sortableId(Date.now()),
        createdAt: new Date().toISOString(),
        scriptName: 'script.list',
        params: {},
        timeout: flags.timeout
      };
      const response = await runCommand(bridgeRoot, command, { timeout: flags.timeout, verbose: flags.verbose });

      if (!isSuccess(response)) {
        await output(response, { format: flags.json ? 'json' : undefined });
        return;
      }

      // For pretty output, format the script list nicely
      if (!flags.json) {
        const data = response.data as any;
        if (data.scripts && Array.isArray(data.scripts)) {
          console.error('\nAvailable Scripts (from extension):\n');

          // Group by category
          const byCategory = data.byCategory || {};
          for (const [category, scripts] of Object.entries(byCategory)) {
            console.error(`  ${category}:`);
            for (const script of scripts as any[]) {
              const desc = script.metadata?.description || 'No description';
              console.error(`    • ${script.alias} - ${desc}`);
            }
            console.error('');
          }
        }
      } else {
        await output(response, { format: 'json' });
      }
    }
  }

  private async runScript(scriptName: string, flags: any): Promise<void> {
    // Check if this is a discovered script
    const discoveredScript = await findScript(scriptName);
    if (discoveredScript) {
      // Run as a dynamic script file
      await this.runScriptFile(discoveredScript.path, flags);
      return;
    }

    // Parse parameters from flags
    const rawParams: Record<string, any> = {};
    if (flags.param) {
      for (const param of flags.param) {
        const [key, ...valueParts] = param.split('=');
        const value = valueParts.join('=');
        rawParams[key] = value; // Keep as string initially for validation
      }
    }

    let validatedParams = rawParams;

    // Validate parameters unless --no-validate flag is set
    if (!flags['no-validate']) {
      try {
        const metadata = manifestLoader.getScriptMetadata(scriptName);
        if (metadata) {
          // Read workspace root from host.json if available, fallback to CWD
          let workspaceRoot = process.cwd();
          try {
            const bridgeRoot = await findBridgeRoot();
            const hostJson = JSON.parse(await fs.promises.readFile(path.join(bridgeRoot, 'host.json'), 'utf8'));
            if (hostJson?.workspace) workspaceRoot = hostJson.workspace;
          } catch { /* best-effort */ }

          const validation = validateParams(metadata, rawParams, { workspaceRoot });

          if (!validation.valid) {
            // Format and display validation errors
            const errorMessage = formatValidationErrors(validation.errors, metadata);
            console.error(errorMessage);
            this.exit(1);
          }

          // Use coerced parameters if validation passed
          let params = validation.coercedParams || rawParams;

          // NEW: translate resolved paths to match extension host platform (e.g., WSL -> Windows)
          try {
            // 1) Read host.json to detect extension platform (win32/darwin/linux)
            const bridgeRoot = await findBridgeRoot();
            const hostJson = JSON.parse(await fs.promises.readFile(path.join(bridgeRoot, 'host.json'), 'utf8'));
            const hostPlatform = hostJson.platform as NodeJS.Platform | undefined; // 'win32' | 'linux' | 'darwin'

            // 2) If CLI is running in WSL and extension is Windows, translate any path-like params
            if (hostPlatform === 'win32' && isWSL()) {
              const paramDefs = metadata.params || {};
              for (const [key, def] of Object.entries(paramDefs)) {
                if (!def || !('resolve' in def) || !def.resolve) continue; // only translate declared path params
                const val = params[key];
                if (typeof val === 'string') {
                  params[key] = wslToWindows(val);
                } else if (Array.isArray(val)) {
                  params[key] = val.map(v => (typeof v === 'string' ? wslToWindows(v) : v));
                }
              }
            }
          } catch {
            // best-effort; non-fatal if host.json absent
          }

          validatedParams = params;
          log(`✓ Parameters validated for '${scriptName}'`);
        } else {
          log(`Warning: Script '${scriptName}' not found in manifest, skipping validation`);
        }
      } catch (error) {
        // Manifest not available, continue without validation
        log(`Warning: Could not load manifest for validation`);

        // Fall back to basic type coercion
        for (const [key, value] of Object.entries(rawParams)) {
          if (value === 'true') {
            validatedParams[key] = true;
          } else if (value === 'false') {
            validatedParams[key] = false;
          } else if (!isNaN(Number(value))) {
            validatedParams[key] = Number(value);
          }
        }
      }
    } else {
      log('Parameter validation skipped (--no-validate flag set)');

      // Still do basic type coercion even when validation is skipped
      for (const [key, value] of Object.entries(rawParams)) {
        if (value === 'true') {
          validatedParams[key] = true;
        } else if (value === 'false') {
          validatedParams[key] = false;
        } else if (!isNaN(Number(value))) {
          validatedParams[key] = Number(value);
        }
      }
    }

    log(`Running script: ${scriptName}`);

    const bridgeRoot = await findBridgeRoot();
    const command: CommandJson = {
      version: 1,
      clientId: `cli-${process.pid}`,
      id: sortableId(Date.now()),
      createdAt: new Date().toISOString(),
      scriptName,
      params: validatedParams,
      timeout: flags.timeout
    };
    const response = await runCommand(bridgeRoot, command, { timeout: flags.timeout, verbose: flags.verbose });

    await output(response, { format: flags.json ? 'json' : undefined });
  }

  private async runScriptFile(filePath: string, flags: any): Promise<void> {
    // Check if file exists
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      this.error(`Script file not found: ${filePath}`);
      return;
    }

    // Read script content
    const scriptContent = await fs.promises.readFile(resolvedPath, 'utf-8');

    // Extract metadata for validation
    const metadata = await extractMetadata(resolvedPath);

    // Parse parameters from flags
    const rawParams: Record<string, any> = {};
    if (flags.param) {
      for (const param of flags.param) {
        const [key, ...valueParts] = param.split('=');
        const value = valueParts.join('=');
        rawParams[key] = value; // Keep as string initially for validation
      }
    }

    let validatedParams = rawParams;

    // Validate if script has its own validation
    if (!flags['no-validate'] && metadata.hasParamsSchema) {
      log(`Script has own validation, will be validated on execution`);
    } else if (flags['no-validate']) {
      log('Parameter validation skipped (--no-validate flag set)');
    }

    // Basic type coercion
    for (const [key, value] of Object.entries(rawParams)) {
      if (value === 'true') {
        validatedParams[key] = true;
      } else if (value === 'false') {
        validatedParams[key] = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        validatedParams[key] = Number(value);
      }
    }

    log(`Running script file: ${filePath}`);

    const bridgeRoot = await findBridgeRoot();
    const command: CommandJson = {
      version: 1,
      clientId: `cli-${process.pid}`,
      id: sortableId(Date.now()),
      createdAt: new Date().toISOString(),
      scriptName: '@dynamic',  // Special alias for dynamic scripts
      scriptContent,  // Include the script content
      params: validatedParams,
      timeout: flags.timeout
    } as any;  // Cast as any since we're extending the interface

    const response = await runCommand(bridgeRoot, command, { timeout: flags.timeout, verbose: flags.verbose });

    await output(response, { format: flags.json ? 'json' : undefined });
  }

  private async showScriptInfo(scriptName: string, flags: any): Promise<void> {
    try {
      const metadata = manifestLoader.getScriptMetadata(scriptName);

      if (!metadata) {
        this.error(`Script '${scriptName}' not found in manifest`);
        return;
      }

      if (flags.json) {
        // Output as JSON
        console.log(JSON.stringify(metadata, null, 2));
      } else {
        // Pretty output
        console.error(`\nScript: ${metadata.alias}`);
        if (metadata.name) console.error(`Name: ${metadata.name}`);
        if (metadata.category) console.error(`Category: ${metadata.category}`);
        if (metadata.description) console.error(`Description: ${metadata.description}`);
        if (metadata.dangerOnly) console.error(`⚠️  Requires danger mode`);

        if (metadata.params && Object.keys(metadata.params).length > 0) {
          console.error(`\nParameters:`);
          for (const [name, def] of Object.entries(metadata.params)) {
            const req = def.required ? ' (required)' : ' (optional)';
            const defVal = def.default !== undefined ? ` [default: ${def.default}]` : '';
            console.error(`  ${name}${req} - ${def.type}${defVal}`);
            if (def.description) {
              console.error(`    ${def.description}`);
            }
            if (def.type === 'enum' && def.values) {
              console.error(`    Allowed values: ${def.values.join(', ')}`);
            }
            if (def.type === 'number') {
              if (def.min !== undefined) console.error(`    Min: ${def.min}`);
              if (def.max !== undefined) console.error(`    Max: ${def.max}`);
              if (def.integer) console.error(`    Must be integer`);
            }
            if (def.type === 'string') {
              if (def.minLength !== undefined) console.error(`    Min length: ${def.minLength}`);
              if (def.maxLength !== undefined) console.error(`    Max length: ${def.maxLength}`);
            }
          }
        } else {
          console.error(`\nNo parameters`);
        }

        if (metadata.errors && metadata.errors.length > 0) {
          console.error(`\nPossible errors:`);
          for (const error of metadata.errors) {
            console.error(`  - ${error}`);
          }
        }

        if (metadata.cli) {
          console.error(`\nCLI Usage:`);
          console.error(`  Command: ${metadata.cli.command}`);
          if (metadata.cli.examples && metadata.cli.examples.length > 0) {
            console.error(`  Examples:`);
            for (const example of metadata.cli.examples) {
              console.error(`    ${example}`);
            }
          }
        }
      }
    } catch (error: any) {
      this.error(`Could not load script info: ${error.message}`);
    }
  }
}