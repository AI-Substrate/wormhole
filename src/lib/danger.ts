import { getConfigValue, setConfigValue } from './config.js';
import chalk from 'chalk';
import readline from 'readline';

/**
 * Check if danger mode is required and prompt if necessary
 */
export async function requireDangerAcknowledgement(options: {
  force?: boolean;
  silent?: boolean;
} = {}): Promise<void> {
  // Check for --yes flag
  const hasYesFlag = process.argv.includes('-y') || process.argv.includes('--yes');
  if (hasYesFlag || options.force) {
    return;
  }

  // Check if already acknowledged in config
  const acknowledged = await getConfigValue('dangerModeAcknowledged');
  if (acknowledged) {
    return;
  }

  // If non-interactive, fail
  if (!process.stdin.isTTY || options.silent) {
    throw new Error(
      'Danger mode requires acknowledgement. Run with --yes to bypass or acknowledge interactively.'
    );
  }

  // Show warning
  console.error('');
  console.error(chalk.yellow('⚠️  WARNING: Danger Mode'));
  console.error('');
  console.error('You are about to execute arbitrary code in your VS Code environment.');
  console.error('This can:');
  console.error('  • Access and modify any file on your system');
  console.error('  • Execute system commands');
  console.error('  • Install or remove software');
  console.error('  • Access network resources');
  console.error('');
  console.error('Only proceed if you trust the source of the code.');
  console.error('');

  const answer = await prompt('Type "I understand the risks" to proceed: ');

  if (answer !== 'I understand the risks') {
    throw new Error('Danger mode acknowledgement declined');
  }

  // Save acknowledgement
  await setConfigValue('dangerModeAcknowledged', true);
  console.error(chalk.green('✓ Danger mode acknowledged and saved'));
  console.error('');
}

/**
 * Simple prompt helper
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Reset danger mode acknowledgement
 */
export async function resetDangerAcknowledgement(): Promise<void> {
  await setConfigValue('dangerModeAcknowledged', false);
}