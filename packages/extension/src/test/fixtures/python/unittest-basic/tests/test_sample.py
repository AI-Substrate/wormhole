import unittest

class TestSample(unittest.TestCase):
    def test_basic(self):
        self.assertTrue(True)

    def test_addition(self):
        self.assertEqual(2 + 2, 4)