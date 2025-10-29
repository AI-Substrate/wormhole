package com.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import java.util.*;
import java.util.stream.*;
import org.junit.jupiter.api.Test;

public class DebugTest {
  static int STATIC_COUNTER = 7;

  @Test
  void inspectLocalsAndStatics() {
    int i = 42;
    String s = "hello";
    List<Integer> list = Arrays.asList(0, 1, 2);
    Map<String, Integer> map = new HashMap<>();
    map.put("a", 1); map.put("b", 2);

    Person p = new Person("Ada", 37);
    // Lambda with capture
    int captured = 9;
    Runnable r = () -> System.out.println("captured = " + captured);

    // Stream pipeline (lazy)
    Stream<Integer> pipeline = list.stream().map(n -> n + i).filter(n -> n > 42);

    // ── set a breakpoint on the next line ──
    assertEquals(3, list.size());
    r.run();
  }

  static class Person {
    final String name; final int age;
    Person(String n, int a) { this.name = n; this.age = a; }
  }
}
