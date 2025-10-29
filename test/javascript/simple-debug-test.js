/**
 * Simple test file for debugging - no Jest required
 */

function testVariableModification() {
    let numberVar = 42;
    let stringVar = "hello";
    let boolVar = true;
    let objVar = { x: 1, y: 2 };

    debugger; // Breakpoint here - now we can modify variables

    tconsole.log('numberVar:', numberVar);
    console.log('stringVar:', stringVar);
    console.log('boolVar:', boolVar);
    console.log('objVar:', objVar);
}

testVariableModification();
console.log('Test complete!');
