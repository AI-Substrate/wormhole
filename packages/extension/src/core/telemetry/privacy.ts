import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as os from 'os';

// ============================================================================
// Precompiled Regex Patterns (Performance: < 5ms per event)
// ============================================================================

/**
 * GitHub token patterns (all 6 prefix types)
 * - ghp_ = Personal Access Token
 * - gho_ = OAuth Access Token
 * - ghu_ = User-to-Server Token
 * - ghs_ = Server-to-Server Token
 * - ghr_ = Refresh Token
 * - github_pat_ = Fine-grained Personal Access Token
 */
const reGitHubToken = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,255}\b|\bgithub_pat_[A-Za-z0-9_]{20,255}\b/gi;

/**
 * AWS Access Key ID patterns
 * Prefixes: AKIA (long-term), ASIA (temporary), A3T/AGPA/AIDA/AROA/AIPA/ANPA/ANVA (service-specific)
 */
const reAwsAccessKeyId = /\b(?:AKIA|ASIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g;

/**
 * AWS Secret Access Key pattern (40-character base64-like string)
 */
const reAwsSecretKey = /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g;

/**
 * JWT (JSON Web Token) pattern - 3-part base64url structure
 */
const reJwt = /\bey[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/g;

/**
 * UUID v4 pattern (8-4-4-4-12 format with '4' in 3rd segment)
 */
const reUuidV4 = /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/**
 * IPv4 address pattern
 */
const reIPv4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

/**
 * URL credentials pattern (user:pass@host)
 */
const reUrlCreds = /\b([a-z]+):\/\/([^:\s/]+):([^@\s/]+)@/gi;

/**
 * Windows user path pattern (C:\Users\username\)
 */
const reWinUser = /([A-Za-z]:\\Users\\)([^\\]+)\\/g;

/**
 * Unix/macOS user path pattern (/home/username/ or /Users/username/)
 */
const reUnixUser = /(\/home\/|\/Users\/)([^/]+)\//g;

/**
 * Path detection pattern (Windows, Unix, vscode-* URIs)
 * Used to detect paths in strings for sanitization
 */
const rePathDetection = /[A-Za-z]:\\[^\s\n\r\t]+|\/[^\s\n\r\t]+|vscode-[^:]+:\/\/[^\s\n\r\t]+/g;

/**
 * SECRET_KEY_NAMES pattern for object key detection
 * Matches keys that likely contain sensitive values
 */
const SECRET_KEY_NAMES = /password|passphrase|authorization|auth[_-]?token|token|secret|apikey|api[_-]?key|bearer/i;

/**
 * Transform file paths to privacy-safe workspace-relative format.
 *
 * Transformation rules (Discovery 08: use workspace INDEX not name):
 * 1. Workspace files: `<ws:0>/relative/path` (using workspace folder index)
 * 2. Home directory files: `~/relative/path`
 * 3. Remote URIs: `<remote:hash>/<hash>.ext` (hash authority + filename, preserve extension only)
 * 4. Untitled files: `<untitled>`
 * 5. Other absolute paths: `<abs:hash>/<basename>.ext` (hash directory, preserve filename with extension)
 *
 * Rationale:
 * - Workspace names can contain PII (project names, company names)
 * - Using index (0, 1, 2...) is privacy-safe and handles multi-root workspaces
 * - Hashing absolute paths provides uniqueness for grouping without exposing sensitive info
 * - **Insight #1**: Hash filenames, preserve extension only (prevents client names in basenames)
 * - Remote URI authority hashing prevents SSH/WSL/Codespaces host disclosure
 *
 * @param filePath - Absolute file path or URI string to sanitize
 * @param workspaceFolders - VS Code workspace folders (optional, defaults to vscode.workspace.workspaceFolders)
 * @returns Privacy-safe path representation
 *
 * @example
 * ```typescript
 * sanitizePath('/workspaces/wormhole/packages/extension/src/test.ts')
 * // Returns: "<ws:0>/packages/extension/src/test.ts"
 *
 * sanitizePath('/home/user/Documents/notes.txt')
 * // Returns: "~/Documents/notes.txt"
 *
 * sanitizePath('vscode-remote://ssh-remote+myhost/home/user/file.ts')
 * // Returns: "<remote:a7b3c2d1>/b8c4d5e6.ts" (hash authority + hash filename, keep .ts)
 *
 * sanitizePath('untitled:Untitled-1')
 * // Returns: "<untitled>"
 *
 * sanitizePath('/random/path/ClientABC-Secret.ts')
 * // Returns: "<abs:hash1>/hash2.ts" (hash directory + hash filename, keep .ts)
 * ```
 */
export function sanitizePath(
	filePath: string,
	workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
): string {
	if (!filePath) {
		return '';
	}

	// Try to parse as URI first (handles vscode-remote://, untitled:, etc.)
	try {
		// Check if it looks like a URI (has scheme)
		if (filePath.includes('://') || filePath.startsWith('untitled:') || filePath.startsWith('vscode-')) {
			const uri = vscode.Uri.parse(filePath);

			// Handle untitled files
			if (uri.scheme === 'untitled') {
				return '<untitled>';
			}

			// Handle remote URIs (vscode-remote, codespaces, etc.)
			if (uri.scheme.startsWith('vscode-')) {
				const remoteName = vscode.env.remoteName || uri.scheme.replace('vscode-', '');
				const authorityHash = crypto.createHash('sha1').update(uri.authority).digest('hex').slice(0, 8);

				// Extract basename and extension
				const pathParts = uri.path.split('/');
				const basename = pathParts[pathParts.length - 1] || '';
				const extMatch = basename.match(/\.([^.]+)$/);
				const ext = extMatch ? extMatch[0] : '';

				// Hash filename, preserve extension only (Insight #1)
				const filenameHash = crypto.createHash('sha1').update(basename).digest('hex').slice(0, 8);

				return `<${remoteName}:${authorityHash}>/${filenameHash}${ext}`;
			}
		}
	} catch {
		// Not a valid URI, fall through to file path handling
	}

	// Normalize path separators for cross-platform consistency
	const normalizedPath = filePath.replace(/\\/g, '/');

	// Check workspace folders (use index for privacy)
	if (workspaceFolders && workspaceFolders.length > 0) {
		for (let i = 0; i < workspaceFolders.length; i++) {
			const wsFolder = workspaceFolders[i];
			const wsFolderPath = wsFolder.uri.fsPath.replace(/\\/g, '/');

			if (normalizedPath.startsWith(wsFolderPath)) {
				const relativePath = normalizedPath.slice(wsFolderPath.length);
				const cleanRelativePath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
				return `<ws:${i}>/${cleanRelativePath}`;
			}
		}
	}

	// Check home directory
	const homeDir = os.homedir().replace(/\\/g, '/');
	if (normalizedPath.startsWith(homeDir)) {
		const relativePath = normalizedPath.slice(homeDir.length);
		const cleanRelativePath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
		return `~/${cleanRelativePath}`;
	}

	// Hash absolute paths for privacy (Insight #1: hash filename, preserve extension)
	const pathParts = normalizedPath.split('/');
	const basename = pathParts[pathParts.length - 1] || '';
	const dirname = pathParts.slice(0, -1).join('/') || '/';

	const dirnameHash = crypto.createHash('sha1').update(dirname).digest('hex').slice(0, 8);

	// Extract extension
	const extMatch = basename.match(/\.([^.]+)$/);
	const ext = extMatch ? extMatch[0] : '';

	// Hash filename, preserve extension only
	const filenameHash = crypto.createHash('sha1').update(basename).digest('hex').slice(0, 8);

	return `<abs:${dirnameHash}>/${filenameHash}${ext}`;
}

/**
 * Scrub personally identifiable information (PII) from strings and objects.
 *
 * **Comprehensive Replacement Patterns**:
 * - File paths: `<ws:0>/path`, `~/path`, `<abs:hash>/<hash>.ext`, `<remote:hash>/<hash>.ext` (via sanitizePath)
 * - GitHub tokens (6 prefixes): `<github_token>`
 * - AWS Access Key IDs: `<aws_access_key_id>`
 * - AWS Secret Keys: `<aws_secret_key>`
 * - JWTs: `<jwt>`
 * - UUID v4: `<uuid>`
 * - IPv4 addresses: `<ip>`
 * - URL credentials: `://<user>:<pass>@`
 * - Windows user paths: `C:\Users\<user>\`
 * - Unix user paths: `/home/<user>/` or `/Users/<user>/`
 * - Email addresses: `<email>`
 *
 * **Recursive Object Handling**:
 * - Strings: Apply all patterns + path sanitization
 * - Objects: Recursively scrub values; redact keys matching SECRET_KEY_NAMES (password, token, secret, etc.)
 * - Arrays: Scrub first 50 items recursively
 * - Primitives (number, boolean, null): Return as-is
 * - Truncation: Strings > 2048 chars, arrays > 50 items, objects > 50 keys
 *
 * Rationale:
 * - **Insight #2**: Overloaded signatures maintain backward compatibility with Phase 2
 * - **Insight #3**: Path sanitization integrated for consistent handling (stack traces, error messages)
 * - Service-specific token prefixes reduce false positives (vs generic 20+ char detection)
 * - Recursive handling catches secrets in complex telemetry properties
 * - SECRET_KEY_NAMES detection prevents leaking credentials in nested objects
 *
 * @param input - String potentially containing PII
 * @returns Scrubbed string with PII replaced
 *
 * @param value - Unknown value (string, object, array, primitive) potentially containing PII
 * @returns Scrubbed value with same type structure, PII replaced
 *
 * @example
 * ```typescript
 * // String overload (backward compatible with Phase 2)
 * scrubPII('User email is john.doe@example.com has token ghp_abc123...')
 * // Returns: "User email is <email> has token <github_token>"
 *
 * scrubPII('Error at /workspaces/wormhole/src/file.ts:42')
 * // Returns: "Error at <ws:0>/src/file.ts:42"
 *
 * // Object overload (Phase 3 enhancement)
 * scrubPII({ config: { apiKey: 'secret123', timeout: 5000 } })
 * // Returns: { config: { apiKey: '<redacted>', timeout: 5000 } }
 *
 * // Array handling
 * scrubPII(['email@example.com', 'ghp_token123...', 42])
 * // Returns: ['<email>', '<github_token>', 42]
 * ```
 */
export function scrubPII(input: string): string;
export function scrubPII(value: unknown): unknown;
export function scrubPII(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	// String handling (with path sanitization - Insight #3)
	if (typeof value === 'string') {
		if (!value) {
			return '';
		}

		let scrubbed = value;

		// **FIRST PASS: Path detection and sanitization (Insight #3)**
		// Detect paths in strings (Windows, Unix, vscode-* URIs) and sanitize them
		scrubbed = scrubbed.replace(rePathDetection, (path) => {
			return sanitizePath(path, vscode.workspace.workspaceFolders ?? []);
		});

		// **SECOND PASS: Secret pattern scrubbing**
		// GitHub tokens (6 prefixes)
		scrubbed = scrubbed.replace(reGitHubToken, '<github_token>');

		// AWS keys
		scrubbed = scrubbed.replace(reAwsAccessKeyId, '<aws_access_key_id>');
		scrubbed = scrubbed.replace(reAwsSecretKey, '<aws_secret_key>');

		// JWT
		scrubbed = scrubbed.replace(reJwt, '<jwt>');

		// UUID v4
		scrubbed = scrubbed.replace(reUuidV4, '<uuid>');

		// IPv4 addresses
		scrubbed = scrubbed.replace(reIPv4, '<ip>');

		// URL credentials
		scrubbed = scrubbed.replace(reUrlCreds, '$1://<user>:<pass>@');

		// Windows user paths
		scrubbed = scrubbed.replace(reWinUser, '$1<user>\\');

		// Unix user paths
		scrubbed = scrubbed.replace(reUnixUser, '$1<user>/');

		// Email addresses (basic pattern, after specific tokens to avoid false positives)
		scrubbed = scrubbed.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>');

		// Truncate long strings
		if (scrubbed.length > 2048) {
			scrubbed = scrubbed.slice(0, 2048) + '…<truncated>';
		}

		return scrubbed;
	}

	// Primitive handling (numbers, booleans)
	if (typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}

	// Array handling (recursive, limit 50 items)
	if (Array.isArray(value)) {
		const scrubbedArray = value.slice(0, 50).map(item => scrubPII(item));
		if (value.length > 50) {
			scrubbedArray.push(`…<${value.length - 50} more items truncated>`);
		}
		return scrubbedArray;
	}

	// Object handling (recursive, SECRET_KEY_NAMES detection, limit 50 keys)
	if (typeof value === 'object') {
		const scrubbed: Record<string, unknown> = {};
		const entries = Object.entries(value as Record<string, unknown>);
		const limitedEntries = entries.slice(0, 50);

		for (const [key, val] of limitedEntries) {
			// Redact keys matching SECRET_KEY_NAMES pattern
			if (SECRET_KEY_NAMES.test(key)) {
				scrubbed[key] = '<redacted>';
			} else {
				// Recursively scrub value
				scrubbed[key] = scrubPII(val);
			}
		}

		if (entries.length > 50) {
			scrubbed['__truncated__'] = `${entries.length - 50} more keys omitted`;
		}

		return scrubbed;
	}

	// Unsupported types (functions, symbols, etc.)
	return '<unsupported>';
}

/**
 * Sanitize script parameters for telemetry transmission.
 *
 * Sanitization rules:
 * - Keep primitives: numbers, booleans, enum-like string values
 * - Remove/sanitize file paths using sanitizePath()
 * - Omit objects and arrays (may contain user data)
 * - Convert all values to strings for telemetry compatibility
 *
 * Rationale:
 * - Script parameters often contain file paths (PII risk)
 * - Objects/arrays may contain user data (code snippets, variable values)
 * - Primitives (numbers, booleans) are generally safe and useful for analytics
 *
 * @param params - Raw script parameters from user
 * @returns Sanitized parameters safe for telemetry
 *
 * @example
 * ```typescript
 * sanitizeParams({
 *   path: '/workspaces/wormhole/test.ts',
 *   line: 42,
 *   enabled: true,
 *   config: { debug: true }
 * })
 * // Returns: {
 * //   path: '<ws:0>/test.ts',
 * //   line: '42',
 * //   enabled: 'true'
 * //   // 'config' omitted (object)
 * // }
 * ```
 */
export function sanitizeParams(params: Record<string, unknown>): Record<string, string> {
	if (!params || typeof params !== 'object') {
		return {};
	}

	const sanitized: Record<string, string> = {};

	for (const [key, value] of Object.entries(params)) {
		// Skip null/undefined
		if (value === null || value === undefined) {
			continue;
		}

		// Keep primitives (numbers, booleans)
		if (typeof value === 'number' || typeof value === 'boolean') {
			sanitized[key] = String(value);
			continue;
		}

		// Sanitize string values
		if (typeof value === 'string') {
			// If key suggests it's a path, sanitize it
			if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
				sanitized[key] = sanitizePath(value);
			} else {
				// Keep short string values (enum-like), scrub longer strings (may contain PII)
				if (value.length <= 50) {
					sanitized[key] = scrubPII(value);
				} else {
					sanitized[key] = '<value-too-long>';
				}
			}
			continue;
		}

		// Omit objects, arrays, functions (may contain user data)
		// No action needed - just skip
	}

	return sanitized;
}
