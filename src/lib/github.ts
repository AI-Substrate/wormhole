import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface GitHubRelease {
  tagName: string;
  name: string;
  isPrerelease: boolean;
  publishedAt: string;
  assets: GitHubAsset[];
}

export interface GitHubAsset {
  name: string;
  size: number;
}

export interface GetLatestReleaseOptions {
  includePrerelease?: boolean;
  owner?: string;
  repo?: string;
}

const DEFAULT_OWNER = 'AI-Substrate';
const DEFAULT_REPO = 'wormhole';

/**
 * GitHub CLI wrapper for vsc-bridge releases
 */
export class GitHubClient {
  private owner: string;
  private repo: string;

  constructor(options: { owner?: string; repo?: string } = {}) {
    this.owner = options.owner || DEFAULT_OWNER;
    this.repo = options.repo || DEFAULT_REPO;

    // Check if gh is available
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch (error) {
      throw new Error(
        'GitHub CLI (gh) is required but not found. Install it from https://cli.github.com/'
      );
    }

    // Check if gh is authenticated
    try {
      execSync('gh auth status', { stdio: 'pipe' });
    } catch (error) {
      throw new Error(
        'GitHub CLI is not authenticated. Run: gh auth login'
      );
    }
  }

  /**
   * Get the latest release
   */
  async getLatestRelease(options: GetLatestReleaseOptions = {}): Promise<GitHubRelease> {
    const { includePrerelease = false } = options;

    // List releases via gh CLI (without assets - not supported in list command)
    const output = execSync(
      `gh release list --repo ${this.owner}/${this.repo} --limit 100 --json tagName,name,isPrerelease,isDraft,publishedAt`,
      { encoding: 'utf-8' }
    );

    const releases = JSON.parse(output);

    if (releases.length === 0) {
      throw new Error('No releases found');
    }

    // Filter out draft releases
    const nonDraftReleases = releases.filter((release: any) => !release.isDraft);

    if (nonDraftReleases.length === 0) {
      throw new Error('No published releases found');
    }

    // Filter based on prerelease preference
    const filteredReleases = includePrerelease
      ? nonDraftReleases
      : nonDraftReleases.filter((release: any) => !release.isPrerelease);

    if (filteredReleases.length === 0) {
      throw new Error('No stable releases found. Use --include-prerelease to see pre-releases.');
    }

    const latestRelease = filteredReleases[0];

    // Get full release details with assets
    return this.getReleaseByTag(latestRelease.tagName);
  }

  /**
   * Get a specific release by tag
   */
  async getReleaseByTag(tag: string): Promise<GitHubRelease> {
    // Ensure tag has 'v' prefix
    const normalizedTag = tag.startsWith('v') ? tag : `v${tag}`;

    try {
      const output = execSync(
        `gh release view ${normalizedTag} --repo ${this.owner}/${this.repo} --json tagName,name,isPrerelease,publishedAt,assets`,
        { encoding: 'utf-8' }
      );

      const release = JSON.parse(output);

      return {
        tagName: release.tagName,
        name: release.name || release.tagName,
        isPrerelease: release.isPrerelease,
        publishedAt: release.publishedAt,
        assets: release.assets.map((asset: any) => ({
          name: asset.name,
          size: asset.size || 0,
        })),
      };
    } catch (error: any) {
      if (error.message?.includes('release not found')) {
        throw new Error(`Release not found: ${normalizedTag}`);
      }
      throw error;
    }
  }

  /**
   * Download an asset using gh CLI
   */
  async downloadAsset(
    release: GitHubRelease,
    assetName: string,
    outputDir: string
  ): Promise<string> {
    // Ensure output directory exists
    await fs.ensureDir(outputDir);

    // Download using gh release download
    execSync(
      `gh release download ${release.tagName} --repo ${this.owner}/${this.repo} --pattern "${assetName}" --dir "${outputDir}" --clobber`,
      { stdio: 'inherit' }
    );

    const outputPath = path.join(outputDir, assetName);

    if (!existsSync(outputPath)) {
      throw new Error(`Failed to download ${assetName}`);
    }

    return outputPath;
  }

  /**
   * Find VSIX asset in a release
   */
  findVsixAsset(release: GitHubRelease): GitHubAsset | null {
    const vsixAsset = release.assets.find((asset) => asset.name.endsWith('.vsix'));
    return vsixAsset || null;
  }
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i))} ${sizes[i]}`;
}
