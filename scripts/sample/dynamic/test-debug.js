/**
 * Test Debug Program
 *
 * A multi-level Node.js program designed for testing debugger status queries.
 * Features:
 * - Multiple stack frames for testing stack trace retrieval
 * - Various variable types for future variable exploration phases
 * - Clear breakpoint location with debugger statement
 * - Circular references and large arrays for edge case testing
 */

// Level 3 - Deepest point in the call stack
function level3() {
    const deepVar = "I'm deep in the stack";
    const localNum = 42;
    const localBool = true;

    console.log("Level 3: About to hit debugger statement");

    // MAIN BREAKPOINT - Line 19
    debugger;  // <-- Execution will pause here

    console.log("Level 3: After debugger statement");
    return { deepVar, localNum };
}

// Level 2 - Middle of the stack
function level2() {
    const midVar = "Middle of the call stack";
    const midArray = [1, 2, 3, 4, 5];
    const midObject = {
        key: "value",
        nested: {
            deep: true
        }
    };

    console.log("Level 2: Calling level3...");
    const result = level3();

    return { ...result, midVar };
}

// Level 1 - Top level function
function level1() {
    const topVar = "Top of the call stack";
    const topObject = {
        message: "Hello from level 1",
        timestamp: new Date().toISOString()
    };

    console.log("Level 1: Calling level2...");
    const result = level2();

    return { ...result, topVar };
}

// Global test data for future variable exploration
const globalTestData = {
    // Simple types
    number: 42,
    string: "Hello, debugger!",
    boolean: true,
    nullValue: null,
    undefinedValue: undefined,

    // Collections
    array: [1, 2, 3, 4, 5],

    // Nested structure
    nested: {
        level1: {
            value: "L1",
            level2: {
                value: "L2",
                level3: {
                    value: "L3",
                    deepest: "You found me!"
                }
            }
        }
    },

    // Date and regex (special types)
    date: new Date(),
    regex: /test.*pattern/gi,

    // Function reference
    func: function testFunction() {
        return "I'm a function";
    }
};

// Add circular reference for edge case testing
globalTestData.circular = globalTestData;

// Large array for testing paging (Phase 2)
const largeArray = Array.from({ length: 100000 }, (_, i) => ({
    index: i,
    value: `Item ${i}`,
    isEven: i % 2 === 0
}));

// Map and Set for testing different collection types
const testMap = new Map([
    ['key1', 'value1'],
    ['key2', 'value2'],
    ['key3', { nested: 'object' }]
]);

const testSet = new Set([1, 2, 3, 'four', 'five', { six: 6 }]);

// Main execution
console.log("=" + "=".repeat(58) + "=");
console.log("DEBUG STATUS TEST PROGRAM");
console.log("=" + "=".repeat(58) + "=");
console.log("");
console.log("This program will pause at the debugger statement in level3()");
console.log("Set a breakpoint at line 19 or rely on the debugger statement");
console.log("");
console.log("Starting call stack...");
console.log("");

// Start the call chain
const result = level1();

console.log("");
console.log("Program completed successfully!");
console.log("Result:", result);
console.log("");
console.log("=" + "=".repeat(58) + "=");