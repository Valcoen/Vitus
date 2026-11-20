import { test } from 'node:test'
import assert from 'node:assert/strict'
import { can, assertCan, PermissionError } from '../permissions'

test('allows every action for any logged-in user while roles are off', () => {
  const actor = { userId: 'u', householdId: 'h', role: null }
  assert.equal(can(actor, 'recipe.delete'), true)
  assert.equal(can({ ...actor, role: 'user' }, 'plan.edit'), true)
})

test('denies anonymous callers', () => {
  assert.equal(can(null, 'recipe.export'), false)
  assert.throws(() => assertCan(null, 'recipe.create'), PermissionError)
})
