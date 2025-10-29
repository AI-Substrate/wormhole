import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizePath, scrubPII, sanitizeParams } from '../../../src/core/telemetry/privacy';

// Mock vscode module
vi.mock('vscode', () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: '/workspaces/wormhole' },
				name: 'wormhole',
				index: 0
			},
			{
				uri: { fsPath: '/other/workspace' },
				name: 'other-workspace',
				index: 1
			}
		]
	},
	Uri: {
		parse: (uriString: string) => {
			// Handle URI parsing
			if (uriString.startsWith('untitled:')) {
				return { scheme: 'untitled', authority: '', path: uriString.substring(9) };
			}
			if (uriString.includes('://')) {
				const [scheme, rest] = uriString.split('://');
				const [authority, ...pathParts] = rest.split('/');
				return {
					scheme,
					authority,
					path: '/' + pathParts.join('/')
				};
			}
			return { scheme: 'file', authority: '', path: uriString };
		},
		file: (path: string) => ({ scheme: 'file', fsPath: path, authority: '', path })
	},
	env: {
		remoteName: 'ssh-remote'
	}
}));

// Mock os module
vi.mock('os', () => ({
	homedir: () => '/home/user'
}));

describe('Privacy Utilities', () => {
	describe('sanitizePath()', () => {
		describe('Workspace Files', () => {
			it('1. Given workspace file, when sanitized, then returns workspace index format', () => {
				const input = '/workspaces/wormhole/src/test.ts';
				const output = sanitizePath(input);

				expect(output).toBe('<ws:0>/src/test.ts');
				expect(output).not.toContain('wormhole'); // No workspace name leak
			});

			it('2. Given multi-root workspace, when sanitized, then returns correct index', () => {
				const input = '/other/workspace/file.py';
				const output = sanitizePath(input);

				expect(output).toBe('<ws:1>/file.py');
				expect(output).not.toContain('other'); // No workspace name leak
			});
		});

		describe('Home Directory Files', () => {
			it('3. Given home directory file, when sanitized, then returns tilde format', () => {
				const input = '/home/user/Documents/notes.txt';
				const output = sanitizePath(input);

				expect(output).toBe('~/Documents/notes.txt');
				expect(output).not.toContain('user'); // No username leak
			});

			it('4. Given Windows home path, when sanitized, then normalizes and hashes', () => {
				// Note: Windows paths don't match Unix home directory mock, so they get hashed
				const input = 'C:\\Users\\johndoe\\Documents\\file.txt';
				const output = sanitizePath(input);

				// Should normalize backslashes and hash (since it doesn't match /home/user)
				expect(output).toMatch(/^<abs:[a-f0-9]{8}>\/[a-f0-9]{8}\.txt$/);
				expect(output).not.toContain('johndoe');
				expect(output).not.toContain('\\');
			});
		});

		describe('Remote URIs', () => {
			it('5. Given vscode-remote SSH URI, when sanitized, then hashes authority and filename', () => {
				const input = 'vscode-remote://ssh-remote+myhost/home/user/file.ts';
				const output = sanitizePath(input);

				// Verify format: <remoteName:hash>/hash.ext
				expect(output).toMatch(/^<[^:]+:[a-f0-9]{8}>\/[a-f0-9]{8}\.ts$/);
				expect(output).not.toContain('myhost'); // No hostname leak
				expect(output).toContain('.ts'); // Extension preserved (Insight #1)
			});
		});

		describe('Untitled Files', () => {
			it('6. Given untitled file URI, when sanitized, then returns generic marker', () => {
				const input = 'untitled:Untitled-1';
				const output = sanitizePath(input);

				expect(output).toBe('<untitled>');
			});
		});

		describe('Absolute Paths', () => {
			it('7. Given absolute Unix path, when sanitized, then hashes directory and filename preserving extension', () => {
				const input = '/random/path/ClientABC-Secret.ts';
				const output = sanitizePath(input);

				// Verify format: <abs:hash>/hash.ext
				expect(output).toMatch(/^<abs:[a-f0-9]{8}>\/[a-f0-9]{8}\.ts$/);
				expect(output).not.toContain('ClientABC'); // Insight #1: No client name in filename
				expect(output).not.toContain('Secret');
				expect(output).toContain('.ts'); // Extension preserved
			});
		});

		describe('Edge Cases', () => {
			it('8. Given empty string, when sanitized, then returns empty string', () => {
				const input = '';
				const output = sanitizePath(input);

				expect(output).toBe('');
			});
		});
	});

	describe('scrubPII()', () => {
		describe('String Handling - Core Patterns', () => {
			it('9. Given string with email, when scrubbed, then email redacted', () => {
				const input = 'Contact john.doe@example.com for help';
				const output = scrubPII(input) as string;

				expect(output).toBe('Contact <email> for help');
				expect(output).not.toContain('john.doe');
				expect(output).not.toContain('@example.com');
			});

			it('10. Given string with GitHub token (ghp_), when scrubbed, then token redacted', () => {
				const input = 'token ghp_1234567890abcdefghijklmnopqrstuvwxyz';
				const output = scrubPII(input) as string;

				expect(output).toBe('token <github_token>');
				expect(output).not.toContain('ghp_');
			});

			it('11. Given string with AWS access key (AKIA), when scrubbed, then key redacted', () => {
				const input = 'key AKIAIOSFODNN7EXAMPLE';
				const output = scrubPII(input) as string;

				expect(output).toBe('key <aws_access_key_id>');
				expect(output).not.toContain('AKIA');
			});

			it('12. Given string with JWT, when scrubbed, then JWT redacted', () => {
				const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
				const output = scrubPII(input) as string;

				expect(output).toBe('Bearer <jwt>');
				expect(output).not.toContain('eyJ');
			});

			it('13. Given string with path, when scrubbed, then path is sanitized (Insight #3: two-pass)', () => {
				const input = 'Error at /workspaces/wormhole/src/file.ts:42';
				const output = scrubPII(input) as string;

				expect(output).toBe('Error at <ws:0>/src/file.ts:42');
				expect(output).not.toContain('wormhole');
			});

			it('14. Given string with multiple patterns, when scrubbed, then all patterns redacted', () => {
				const input = 'User john@example.com has token ghp_1234567890abcdefghijklmnopqrstuvwxyz at /home/user/file.ts';
				const output = scrubPII(input) as string;

				expect(output).toContain('<email>');
				expect(output).toContain('<github_token>');
				expect(output).toContain('~/file.ts');
				expect(output).not.toContain('john@example.com');
				expect(output).not.toContain('ghp_');
				expect(output).not.toContain('/home/user');
			});

			it('15. Given string > 2048 chars, when scrubbed, then string truncated', () => {
				const input = 'x'.repeat(2100);
				const output = scrubPII(input) as string;

				expect(output.length).toBeLessThanOrEqual(2060); // 2048 + truncation marker
				expect(output).toContain('…<truncated>');
			});
		});

		describe('Object Handling', () => {
			it('16. Given object with SECRET_KEY_NAMES key (apiKey), when scrubbed, then value redacted', () => {
				const input = { apiKey: 'secret123', timeout: 5000 };
				const output = scrubPII(input) as any;

				expect(output.apiKey).toBe('<redacted>');
				expect(output.timeout).toBe(5000); // Non-secret preserved
			});

			it('17. Given nested object with secrets, when scrubbed, then recursive scrubbing works', () => {
				const input = {
					config: {
						password: 'pass123',
						timeout: 5000
					}
				};
				const output = scrubPII(input) as any;

				expect(output.config.password).toBe('<redacted>');
				expect(output.config.timeout).toBe(5000);
			});

			it('18. Given object with PII in values, when scrubbed, then PII scrubbed', () => {
				const input = { email: 'user@example.com', count: 42 };
				const output = scrubPII(input) as any;

				expect(output.email).toBe('<email>');
				expect(output.count).toBe(42);
			});
		});

		describe('Array Handling', () => {
			it('19. Given array with PII, when scrubbed, then elements scrubbed', () => {
				const input = ['email@example.com', 'ghp_token123456789012345678901234567890', 42];
				const output = scrubPII(input) as any[];

				expect(output[0]).toBe('<email>');
				expect(output[1]).toBe('<github_token>');
				expect(output[2]).toBe(42);
			});
		});

		describe('Primitive Handling', () => {
			it('20. Given primitives (number, boolean), when scrubbed, then returned as-is', () => {
				expect(scrubPII(42)).toBe(42);
				expect(scrubPII(true)).toBe(true);
				expect(scrubPII(false)).toBe(false);
				expect(scrubPII(null)).toBe(null);
				expect(scrubPII(undefined)).toBe(undefined);
			});
		});
	});

	describe('sanitizeParams()', () => {
		describe('Path Parameters', () => {
			it('21. Given param with "path" key, when sanitized, then value sanitized as path', () => {
				const input = { path: '/workspaces/wormhole/test.ts', line: 42 };
				const output = sanitizeParams(input);

				expect(output.path).toBe('<ws:0>/test.ts');
				expect(output.line).toBe('42'); // Number converted to string
			});
		});

		describe('Primitive Values', () => {
			it('22. Given number parameter, when sanitized, then converted to string', () => {
				const input = { line: 42, enabled: true };
				const output = sanitizeParams(input);

				expect(output.line).toBe('42');
				expect(output.enabled).toBe('true');
			});

			it('23. Given boolean parameter, when sanitized, then converted to string', () => {
				const input = { enabled: true, debug: false };
				const output = sanitizeParams(input);

				expect(output.enabled).toBe('true');
				expect(output.debug).toBe('false');
			});
		});

		describe('String Values', () => {
			it('24. Given short string (<50 chars), when sanitized, then scrubbed and kept', () => {
				const input = { mode: 'debug' };
				const output = sanitizeParams(input);

				expect(output.mode).toBe('debug');
			});

			it('25. Given long string (>50 chars), when sanitized, then replaced with marker', () => {
				const input = { message: 'x'.repeat(60) };
				const output = sanitizeParams(input);

				expect(output.message).toBe('<value-too-long>');
			});
		});
	});
});
