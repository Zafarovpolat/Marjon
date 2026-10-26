import test from 'node:test'
import assert from 'node:assert/strict'
import { displayMessage, errorMessage } from '../src/shared/errorMessage.mjs'
import { isUuid, validateOrderCreate, resolveOrderCreate } from '../src/shared/orderValidation.mjs'

const branch = '11111111-1111-4111-8111-111111111111'
const table = '22222222-2222-4222-8222-222222222222'

test('validation objects become readable text instead of React children', () => {
  const detail = [{type:'uuid_parsing',loc:['body','table_id'],msg:'invalid UUID',input:'d1'}]
  assert.match(errorMessage({response:{data:{detail}}}), /Обновите список столов/)
  assert.equal(typeof displayMessage(detail), 'string')
})
test('nested errors, strings, errors, nulls and unknown objects stay safe', () => {
  assert.equal(errorMessage(new Error('Сеть недоступна')), 'Сеть недоступна')
  assert.equal(errorMessage({response:{data:{detail:{message:'Недостаточно прав'}}}}), 'Недостаточно прав')
  assert.equal(displayMessage([{}, 'Ошибка', {msg:'Ошибка'}]), 'Ошибка')
  assert.equal(displayMessage({private_token:'secret'}, 'Не удалось'), 'Не удалось')
  assert.equal(displayMessage(null, 'Не удалось'), 'Не удалось')
  const circular = {}; circular.detail = circular
  assert.equal(displayMessage(circular, 'Не удалось'), 'Не удалось')
})
test('missing branch is explained without rendering request details', () => {
  assert.match(displayMessage({type:'missing',loc:['body','branch_id'],msg:'Field required'}), /Не выбран филиал/)
})
test('only real UUID seating is accepted; validation never mutates the payload', () => {
  const data = {branch_id:branch,table_id:table,table_number:'6',items:[]}
  assert.equal(validateOrderCreate(data), data)
  assert.equal(data.table_id, table)
  assert.equal(isUuid('d6'), false)
  assert.equal(isUuid(table), true)
})
test('synthetic table IDs are rejected before any request, never replaced with unassigned seating', () => {
  assert.throws(() => validateOrderCreate({branch_id:branch,table_id:'d6'}), /определить стол/)
  assert.throws(() => validateOrderCreate({branch_id:null,table_id:table}), /Не выбран филиал/)
  assert.throws(() => validateOrderCreate({branch_id:'not-a-branch'}), /Не выбран филиал/)
})
test('delivery, takeaway and intentional orders without a table remain supported', () => {
  for (const order_type of ['delivery','takeaway','dine_in']) {
    const data = {branch_id:branch,order_type,items:[]}
    assert.equal(validateOrderCreate(data), data)
    assert.equal(data.table_id, undefined)
  }
})

test('company-wide cashier and waiter recover the branch of their actual table', async () => {
  for (const role of ['cashier', 'waiter']) {
    const data = {branch_id:null,table_id:table,items:[],role}
    const payload = await resolveOrderCreate(data, {
      loadHalls: async () => [{branch_id:branch,tables:[{id:table}]}],
      loadBranches: async () => { throw Error('Must not guess from branches') },
    })
    assert.equal(payload.branch_id,branch)
    assert.equal(payload.table_id,table)
    assert.equal(data.branch_id,null)
  }
})

test('missing or ambiguous table ownership never falls back to a random branch', async () => {
  for (const halls of [[],[{branch_id:branch,tables:[]}],[{tables:[{id:table}]}],
    [{branch_id:branch,tables:[{id:table}]},{branch_id:branch,tables:[{id:table}]}]]) {
    await assert.rejects(resolveOrderCreate({table_id:table}, {
      loadHalls:async()=>halls,loadBranches:async()=>[{id:branch}],
    }), /филиал стола/)
  }
})

test('unseated orders infer only a unique active company branch', async () => {
  const deps={loadHalls:async()=>{throw Error('No table')},loadBranches:async()=>[{id:branch}]}
  assert.equal((await resolveOrderCreate({order_type:'takeaway'},deps)).branch_id,branch)
  for (const branches of [[],[{id:branch},{id:table}]]) {
    await assert.rejects(resolveOrderCreate({order_type:'delivery'}, {...deps,loadBranches:async()=>branches}), /выбрать филиал/)
  }
  await assert.rejects(resolveOrderCreate({table_id:table},{loadHalls:async()=>{throw Error('offline')}}),/offline/)
})
