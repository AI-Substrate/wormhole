import 'package:test/test.dart';

int add(int a, int b) {
  final result = a + b;
  return result;
}

int subtract(int a, int b) {
  final result = a - b;
  return result;
}

void main() {
  test('debug simple arithmetic', () {
    final x = 5;
    final y = 3;

    // VSCB_BREAKPOINT_NEXT_LINE
    final sum = add(x, y);        // Stage 1: x=5, y=3
    final diff = subtract(x, y);

    expect(sum, equals(8));
    // VSCB_BREAKPOINT_2_NEXT_LINE
    expect(diff, equals(2));      // Stage 6: all variables
  });
}
