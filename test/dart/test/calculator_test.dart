import 'package:test/test.dart';
import 'package:dart_test_project/calculator.dart';

void main() {
  group('Calculator', () {
    test('add calculates the sum of two integers', () {
      // VSCB_BREAKPOINT_NEXT_LINE
      final result = add(2, 3);

      expect(result, equals(5));
    });

    test('subtract finds the difference of two integers', () {
      // VSCB_BREAKPOINT_NEXT_LINE
      final result = subtract(10, 4);

      expect(result, equals(6));
    });
  });
}
