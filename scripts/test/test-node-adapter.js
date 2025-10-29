/**
 * Test Node Debug Adapter - Comprehensive test program
 *
 * This program includes all test cases for validating the NodeDebugAdapter:
 * - Simple variables (primitives, strings, booleans)
 * - Deep nesting (4+ levels)
 * - Circular references (self-referential objects)
 * - Large arrays (100k+ elements)
 * - Mixed types (objects, arrays, functions, null, undefined)
 *
 * Usage:
 * 1. Set a breakpoint on line 60 (marked with // BREAKPOINT HERE)
 * 2. Run this file in VS Code debugger
 * 3. When paused, test the NodeDebugAdapter via list-variables
 *
 * Test Scenarios:
 * - T-NJS-001: List variables with default depth (2)
 * - T-NJS-002: List variables with maxDepth=5
 * - T-NJS-003: Circular reference detection
 * - T-NJS-004: Large array pagination
 * - T-NJS-005: Memory budget enforcement
 * - T-NJS-006: Set simple variable
 * - T-NJS-007: Set object property via evaluate
 * - T-NJS-008: Get variable children with pagination
 * - T-NJS-009: Stream suggestion at threshold
 */

// Test Case 1: Simple variables
const simpleVars = {
    a: 1,
    b: "test",
    c: true,
    d: false,
    e: null,
    f: undefined
};

// Test Case 2: Deep nesting (5 levels)
const deepNested = {
    level1: {
        name: "Level 1",
        level2: {
            name: "Level 2",
            level3: {
                name: "Level 3",
                level4: {
                    name: "Level 4",
                    level5: {
                        name: "Level 5 - deepest",
                        value: 42
                    }
                }
            }
        }
    }
};

// Test Case 3: Circular references (Object.is() detection)
const circular = {
    name: "root",
    id: 1
};
circular.self = circular; // Self-reference
circular.nested = {
    name: "nested",
    parent: circular // Circular back to root
};

// Test Case 4: Large array (for pagination testing)
const largeArray = Array(100000).fill(0).map((_, i) => ({
    index: i,
    value: `item-${i}`,
    squared: i * i
}));

// Test Case 5: Mixed types
const mixedTypes = {
    number: 42,
    string: "hello world",
    boolean: true,
    null: null,
    undefined: undefined,
    array: [1, 2, 3, 4, 5],
    object: { x: 1, y: 2, z: 3 },
    func: function() { return "test"; },
    arrow: () => "arrow function",
    bigint: BigInt(9007199254740991),
    symbol: Symbol('test'),
    date: new Date('2025-01-01'),
    regex: /test/gi,
    map: new Map([['key1', 'value1'], ['key2', 'value2']]),
    set: new Set([1, 2, 3, 4, 5]),
    error: new Error('Test error')
};

// Test Case 6: Nested arrays and objects
const complex = {
    matrix: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
    ],
    nested: {
        data: [
            { name: "A", values: [1, 2, 3] },
            { name: "B", values: [4, 5, 6] },
            { name: "C", values: [7, 8, 9] }
        ]
    }
};

// Test Case 7: Object with many properties (for maxChildren testing)
const manyProps = {};
for (let i = 0; i < 200; i++) {
    manyProps[`prop${i}`] = i;
}

// Test Case 8: Modifiable variables (for setVariable testing)
let modifiable = {
    counter: 0,
    name: "original",
    nested: {
        value: 100
    }
};

// Test Case 9: Special number values (Code Review: Safe expression builder)
const specialNumbers = {
    nan: NaN,
    infinity: Infinity,
    negInfinity: -Infinity,
    zero: 0,
    negZero: -0,
    maxSafe: Number.MAX_SAFE_INTEGER,
    minSafe: Number.MIN_SAFE_INTEGER
};

// Test Case 10: BigInt values (Code Review: BigInt support)
const bigIntValues = {
    small: 123n,
    large: 9007199254740991n,
    negative: -456n
};

// Test Case 11: Objects with throwing getters (Code Review: Side-effect detection)
const throwingGetters = {
    normalProp: "safe",
    get dangerousGetter() {
        throw new Error("Getter throws!");
    },
    get sideEffectGetter() {
        console.log("Side effect!");
        return "value";
    }
};

// Test Case 12: Large Map (Code Review: Special type handling)
const largeMap = new Map();
for (let i = 0; i < 1000; i++) {
    largeMap.set(`key${i}`, `value${i}`);
}

// Test Case 13: Large Set (Code Review: Special type handling)
const largeSet = new Set();
for (let i = 0; i < 1000; i++) {
    largeSet.add(`item${i}`);
}

// Test Case 14: TypedArrays (Code Review: Special type handling)
const typedArrays = {
    uint8: new Uint8Array(100).fill(42),
    int32: new Int32Array(50).fill(-123),
    float64: new Float64Array(25).fill(3.14)
};

// Test Case 15: Buffer (Node-specific)
const buffer = Buffer.alloc(256);
buffer.write("Test buffer content");

// BREAKPOINT HERE - Set breakpoint on this line
console.log("Ready for testing!");
console.log("Variables to test:", {
    simpleVars,
    deepNested,
    circular,
    largeArray: `${largeArray.length} items`,
    mixedTypes,
    complex,
    manyProps: `${Object.keys(manyProps).length} properties`,
    modifiable,
    specialNumbers,
    bigIntValues,
    throwingGetters,
    largeMap: `${largeMap.size} entries`,
    largeSet: `${largeSet.size} items`,
    typedArrays,
    buffer: `${buffer.length} bytes`
});

// After manual testing, you can modify variables here to verify changes
modifiable.counter = 999;
modifiable.name = "modified";

console.log("Test complete!", modifiable);
