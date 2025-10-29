/**
 * Test Program - Variable Exploration Testing
 *
 * Comprehensive test program for Phase 1 variable retrieval testing.
 * Includes all edge cases: primitives, nested, circular, large collections.
 *
 * To debug this program:
 *   1. Open this file in VS Code
 *   2. Set a breakpoint on line 60 (the debugger statement)
 *   3. Press F5 or use Run > Start Debugging
 *   4. While paused, test variable retrieval:
 *      - just sample-vars
 *      - just sample-vars --param maxDepth=1
 *      - just sample-vars --param maxDepth=3
 *      - just sample-vars --param maxChildren=10
 */

function testVariables() {
    // ============================================================
    // PRIMITIVES - Basic types
    // ============================================================
    const num = 42;
    const str = "hello world";
    const bool = true;
    const nullVal = null;
    const undefinedVal = undefined;
    const bigNum = 12345678901234567890n;

    // ============================================================
    // COLLECTIONS - Arrays and simple objects
    // ============================================================
    const arr = [1, 2, 3, 4, 5];
    const simpleObj = { key: "value", count: 10, active: true };

    // ============================================================
    // NESTED (3 LEVELS) - Test depth limiting
    // ============================================================
    const nested = {
        level1: {
            value: "L1",
            data: { x: 1, y: 2 },
            level2: {
                value: "L2",
                data: { a: "alpha", b: "beta" },
                level3: {
                    value: "L3",
                    deepest: "You found me!",
                    metadata: {
                        timestamp: Date.now(),
                        source: "test"
                    }
                }
            }
        }
    };

    // ============================================================
    // CIRCULAR REFERENCE - Test cycle detection (Critical Discovery 04)
    // ============================================================
    const circular = {
        name: "circular",
        id: 123,
        data: [1, 2, 3]
    };
    circular.self = circular;  // Create cycle

    // Another circular pattern
    const nodeA = { name: "A", next: null };
    const nodeB = { name: "B", next: null };
    nodeA.next = nodeB;
    nodeB.next = nodeA;  // Cycle: A -> B -> A

    // ============================================================
    // MANY CHILDREN - Test maxChildren budget (T009)
    // ============================================================
    const manyProps = {};
    for (let i = 0; i < 100; i++) {
        manyProps[`prop${i}`] = {
            index: i,
            value: i * 2,
            label: `Item ${i}`
        };
    }

    // ============================================================
    // LARGE ARRAY - For Phase 2 paging tests
    // ============================================================
    const largeArray = Array.from({ length: 100000 }, (_, i) => ({
        id: i,
        value: `Item ${i}`,
        even: i % 2 === 0
    }));

    // ============================================================
    // COMPLEX NESTED STRUCTURE
    // ============================================================
    const complex = {
        user: {
            profile: {
                name: "Alice",
                age: 30,
                address: {
                    street: "123 Main St",
                    city: "Springfield",
                    country: "USA"
                }
            },
            settings: {
                theme: "dark",
                notifications: {
                    email: true,
                    push: false,
                    sms: true
                }
            }
        },
        metadata: {
            created: new Date(),
            version: "1.0.0"
        }
    };

    // ============================================================
    // MIXED TYPES ARRAY
    // ============================================================
    const mixedArray = [
        42,
        "string",
        true,
        null,
        { nested: "object" },
        [1, 2, 3],
        undefined,
        function() { return "function"; }
    ];

    // BREAKPOINT HERE - Line 135
    debugger;  // <-- Pause here to test variable retrieval

    console.log("Test complete");
    return num;
}

// ============================================================
// GLOBAL DATA - Test global scope
// ============================================================
const globalData = {
    simple: 42,
    string: "global string",
    array: [1, 2, 3, 4, 5],
    nested: {
        level1: {
            level2: {
                level3: "deep global value"
            }
        }
    }
};

// Add circular reference to global
globalData.circular = globalData;

// Global large object
const globalConfig = {};
for (let i = 0; i < 50; i++) {
    globalConfig[`setting${i}`] = {
        enabled: i % 2 === 0,
        value: i * 10
    };
}

// ============================================================
// RUN TEST
// ============================================================
console.log("Starting variable exploration test program...");
console.log("Set a breakpoint at line 135 (debugger statement)");
console.log("Then run: just sample-vars");
console.log("");

const result = testVariables();

console.log("Test program complete!");
console.log("Result:", result);
