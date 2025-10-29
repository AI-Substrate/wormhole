import { ITestEnvironmentDetector, ITestEnvironment } from './interfaces';
import { PythonTestDetector } from './detectors/PythonTestDetector';

/**
 * Factory for creating test environment detectors
 */
export class TestDetectorFactory {
    private static instance: TestDetectorFactory;
    private readonly detectorConstructors = new Map<string, () => ITestEnvironmentDetector<any>>();

    private constructor() {
        // Register built-in detectors
        this.registerBuiltInDetectors();
    }

    /**
     * Get singleton instance
     */
    static getInstance(): TestDetectorFactory {
        if (!TestDetectorFactory.instance) {
            TestDetectorFactory.instance = new TestDetectorFactory();
        }
        return TestDetectorFactory.instance;
    }

    /**
     * Register built-in detectors
     */
    private registerBuiltInDetectors(): void {
        // Python detector
        this.detectorConstructors.set('python', () => new PythonTestDetector());

        // JavaScript detector placeholder - will be implemented in later phases
        this.detectorConstructors.set('javascript', () => {
            // Placeholder detector for JavaScript
            return {
                supportedLanguages: ['javascript'],
                async canHandle(folder, file) {
                    if (!file) return false;
                    return file.path.endsWith('.js') || file.path.endsWith('.ts');
                },
                async detect(folder) {
                    return {
                        language: 'javascript',
                        framework: 'none',
                        confidence: 0.1,
                        reasons: ['JavaScript support coming in Phase 3'],
                        projectRoot: folder.uri.fsPath,
                        cwd: folder.uri.fsPath,
                        testFilePatterns: [],
                        debugConfig: {
                            type: 'node',
                            name: 'Debug JavaScript Test',
                            request: 'launch'
                        }
                    } as ITestEnvironment;
                },
                watchGlobs() {
                    return ['**/package.json', '**/jest.config.*'];
                },
                quickScore(filePath: string) {
                    if (filePath.endsWith('.js') || filePath.endsWith('.ts')) return 0.8;
                    return 0.2;
                }
            } as ITestEnvironmentDetector<ITestEnvironment>;
        });
    }

    /**
     * Create detector by language
     */
    createDetector(language: string): ITestEnvironmentDetector<any> | null {
        const constructor = this.detectorConstructors.get(language.toLowerCase());
        if (!constructor) {
            console.warn(`No detector registered for language: ${language}`);
            return null;
        }

        try {
            return constructor();
        } catch (error) {
            console.error(`Failed to create detector for ${language}`, error);
            return null;
        }
    }

    /**
     * Create all available detectors
     */
    createAllDetectors(): ITestEnvironmentDetector<any>[] {
        const detectors: ITestEnvironmentDetector<any>[] = [];

        for (const [language, constructor] of this.detectorConstructors) {
            try {
                const detector = constructor();
                detectors.push(detector);
                console.debug(`Created detector for ${language}`);
            } catch (error) {
                console.error(`Failed to create detector for ${language}`, error);
            }
        }

        return detectors;
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages(): string[] {
        return Array.from(this.detectorConstructors.keys());
    }

    /**
     * Register a custom detector constructor
     */
    registerDetectorConstructor(
        language: string,
        constructor: () => ITestEnvironmentDetector<any>
    ): void {
        if (this.detectorConstructors.has(language)) {
            console.warn(`Overwriting existing detector for ${language}`);
        }
        this.detectorConstructors.set(language.toLowerCase(), constructor);
        console.info(`Registered detector constructor for ${language}`);
    }

    /**
     * Unregister a detector
     */
    unregisterDetector(language: string): boolean {
        const result = this.detectorConstructors.delete(language.toLowerCase());
        if (result) {
            console.info(`Unregistered detector for ${language}`);
        }
        return result;
    }

    /**
     * Check if a detector is registered
     */
    hasDetector(language: string): boolean {
        return this.detectorConstructors.has(language.toLowerCase());
    }

    /**
     * Reset factory to initial state
     */
    reset(): void {
        this.detectorConstructors.clear();
        this.registerBuiltInDetectors();
        console.debug('Factory reset to initial state');
    }
}