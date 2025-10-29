import unittest

class TestSample(unittest.TestCase):
    def test_example(self):
        x = 1 + 1
        self.assertEqual(x, 2)

if __name__ == '__main__':
    unittest.main()
