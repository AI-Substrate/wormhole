using Xunit;

namespace IntegrationSimple
{
    /// <summary>
    /// Unified Integration Test for MCP Debugging (C# - xUnit)
    ///
    /// Template: This structure is mirrored in all languages
    /// Expected variables at breakpoint 1 (line 26): x=5, y=3
    /// Expected variables at breakpoint 2 (line 30): x=5, y=3, sum=8, diff=2
    ///
    /// Enhanced Coverage:
    /// - Breakpoint 1: Initial breakpoint for step-in/step-out testing
    /// - Step in to Add() method to validate parameters (a=5, b=3)
    /// - Step out back to test to validate return value (sum=8)
    /// - Breakpoint 2: Second breakpoint for continue testing
    /// - Validate all variables present after execution
    /// </summary>
    public class DebugTest
    {
                        private int Add(int a, int b) => a + b;

        private int Subtract(int a, int b) => a - b;

        [Fact]
        public void TestDebugSimpleArithmetic()
        {
            int x = 5;
            int y = 3;

            // VSCB_BREAKPOINT_NEXT_LINE
            int sum = Add(x, y);         // Expected: sum = 8 (Breakpoint 1 - step-in target)
            int diff = Subtract(x, y);   // Expected: diff = 2

            Assert.Equal(8, sum);
            // VSCB_BREAKPOINT_2_NEXT_LINE
            Assert.Equal(2, diff);       // Breakpoint 2 - continue target
        }
    }
}
