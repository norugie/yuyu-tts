import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hello } from '../src/hello.ts';

test('hello greets by name', () => {
  assert.equal(hello('yuyu'), 'hello yuyu');
});
