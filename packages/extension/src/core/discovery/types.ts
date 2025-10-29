import { z } from 'zod';

/**
 * Script manifest metadata schema
 */
export const ScriptMetadataSchema = z.object({
    alias: z.string().min(1),
    category: z.string().optional(),
    description: z.string().optional(),
    dangerOnly: z.boolean().optional().default(false),
    params: z.record(z.string(), z.object({
        type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
        required: z.boolean().optional().default(true),
        description: z.string().optional(),
        default: z.any().optional()
    })).optional(),
    response: z.enum(['action', 'query', 'waitable', 'stream']).optional().default('action'),
    errors: z.array(z.string()).optional(),
    cli: z.object({
        command: z.string().optional(),
        description: z.string().optional(),
        examples: z.array(z.string()).optional()
    }).optional(),
    mcp: z.object({
        tool: z.string().optional(),
        description: z.string().optional()
    }).optional()
});

export type ScriptMetadata = z.infer<typeof ScriptMetadataSchema>;

/**
 * Manifest entry
 */
export interface ManifestEntry {
    metadata: ScriptMetadata;
    scriptRelPath: string;
}

/**
 * Full manifest structure
 */
export interface ScriptManifest {
    version: string;
    generatedAt: string;
    scripts: Record<string, ManifestEntry>;
}