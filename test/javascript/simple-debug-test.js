/**
 * Simple test file for debugging - no Jest required
 */

/**
 * testVariableModification - Enhanced with documentation
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
/**
 * testVariableModification - Enhanced with documentation
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
function testVariableModification(a, b) {
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new TypeError('Arguments must be numbers');
    }
    return a + b;
}

testVariableModification();
console.log('Test complete!');
