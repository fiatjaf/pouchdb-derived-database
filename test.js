var tape = require('tape')
var PouchDB = require('pouchdb-core')
var Promise = require('pouchdb-promise')
var upsert = require('pouchdb-utils').upsert

PouchDB.plugin(require('pouchdb-adapter-leveldb'))
PouchDB.plugin(require('./src'))

var test = function (name, fun) {
  var db = new PouchDB('test-' + name, { db: require('memdown') })

  tape(name, function (t) {
    fun(db, t)
  })
}

var docs = [
  {_id: 'a', group: 'letters', val: 1, text: 'ei'},
  {_id: '1', group: 'numbers', val: 1, text: 'one'},
  {_id: '3', group: 'numbers', val: 3, text: 'three'},
  {_id: 'c', group: 'letters', val: 3, text: 'see'},
  {_id: 'b', group: 'letters', val: 2, text: 'bee'},
  {_id: '2', group: 'numbers', val: 2, text: 'two'}
]

test('basic', function (db, t) {
  t.plan(10)
  var derivedDB

  db.bulkDocs(docs)
    .then(() => {
      return db.setDerived('sum', function derivator (params) {
        var groupName = params.change.doc.group
        return upsert(params.db, groupName, (doc) => {
          doc.values = doc.values || []
          doc.values.push(params.change.doc.val)
          doc.sum = doc.values.reduce((a, b) => a + b, 0)
          return doc
        })
      })
    })
    .then(derived => {
      t.equals(derived.name, 'sum', 'correct derived db name')
      derivedDB = derived.db

      return new Promise(function (fulfill) {
        setTimeout(fulfill, 200)
      })
    }).then(() => {
      return derivedDB.allDocs({include_docs: true})
    })
    .then(res => {
      t.equals(res.rows.length, 2, 'correct derived doc count after creation')
      t.equals(res.rows[0].doc._id, 'letters')
      t.equals(res.rows[0].doc.sum, 6)
      t.equals(res.rows[1].doc._id, 'numbers')
      t.equals(res.rows[1].doc.sum, 6)

      var l = derivedDB.changes({include_docs: true, since: 'now', live: true}).on('change', function (c) {
        t.equals(c.doc.sum, 10, 'changes emitted correctly on derived db')
        t.deepEqual(c.doc.values, [1, 3, 2, 4], 'letters doc has values ordered as expected')
        l.cancel()
      })

      return db.put({_id: 'd', group: 'letters', val: 4, text: 'dee'})
    })
    .then(() => new Promise(function (fulfill) { setTimeout(fulfill, 200) }))
    .then(() => db.put({_id: '~', group: 'accents', val: 23, text: 'tilde'}))
    .then(() => new Promise(function (fulfill) { setTimeout(fulfill, 200) }))
    .then(() => derivedDB.get('accents'))
    .then(accents => {
      t.equals(accents._rev.split('-')[0], '1', 'accents document exists')
      t.equals(accents.sum, 23, 'accents document has correct sum')
      t.end()
    })
    .catch(err => {
      console.log(err)
      console.log(err.stack)
      t.fail()
    })
})

test('access-as-normal-db', function (db, t) {
  t.plan(2)

  db.bulkDocs(docs)
    .then(() =>
      db.setDerived('all-changes', function derivator (params) {
        return upsert(params.db, 'seq-' + params.change.seq, function (doc) {
          doc._id = 'seq-' + params.change.seq
          doc.change = params.change
          return doc
        })
      })
    )
    .then(derived => derived.db)
    .then(any => new Promise(function (fulfill) { setTimeout(() => fulfill(any), 200) }))
    .then((ddb) => {
      var ddbAlso = new PouchDB('all-changes', {db: require('memdown')})
      return Promise.all([
        ddb.allDocs({include_docs: true}),
        ddbAlso.allDocs({include_docs: true})
      ])
    })
    .then(resp => {
      t.deepEqual(resp[0], resp[1], 'opening the derived db with the PouchDB constructor works')
      t.equals(resp[0].rows.length, 6, 'correct number of documents in derived db')
    })
    .catch(err => {
      console.log(err)
      console.log(err.stack)
      t.fail()
    })
})

test('destroy', function (db, t) {
  t.plan(1)

  db.setDerived('anything', function derivator (params) { /* does nothing */ })
    .then(derived => derived.db)
    .then(ddb => {
      ddb.on('destroyed', function () {
        t.equal(1, 1, 'derived db is destroyed when the primary db is destroyed')
        t.end()
      })
      return db.destroy()
    })
})

test('stop-and-continue', function (db, t) {
  t.plan(6)

  var ddb = new PouchDB('stats', {db: require('memdown')})
  var derivator = function (params) {
    return Promise.all([
      upsert(params.db, 'sum', function (doc) {
        doc.val = doc.val || 0
        doc.val -= params.change.doc._rev.slice(0, 2) !== '1-' ? params.change.doc.val : 0
        if (!params.change.deleted) {
          doc.val += params.change.doc.val
        }
        return doc
      }),
      upsert(params.db, 'count', function (doc) {
        doc.val = doc.val || 0
        if (params.change.deleted) {
          doc.val -= 1
        } else if (params.change.doc._rev.slice(0, 2) === '1-') {
          doc.val += 1
        }
        return doc
      })
    ])
  }
  var stop

  db.on('change', console.log.bind(console, 'CHANGE'))

  db.setDerived('stats', derivator)
    .then(derived => {
      stop = derived.stop
    })
    .then(() => db.post({val: 7}))
    .then(any => new Promise(function (fulfill) { setTimeout(() => fulfill(any), 200) }))
    .then(() => ddb.allDocs({include_docs: true}))
    .then(res => {
      t.equals(res.rows[0].doc._id, 'count', 'derivation is working')
      t.equals(res.rows[0].doc.val, 1)
      t.equals(res.rows[1].doc._id, 'sum')
      t.equals(res.rows[1].doc.val, 7)

      stop()
      return db.post({val: 12})
    })
    .then(any => new Promise(function (fulfill) { setTimeout(() => fulfill(any), 200) }))
    .then(() => ddb.get('count'))
    .then(count => {
      t.equals(count.val, 1, 'derived db was not updated after derivation was stopped.')

      return db.setDerived('stats', derivator)
    })
    .then(any => new Promise(function (fulfill) { setTimeout(() => fulfill(any), 200) }))
    .then(() => ddb.get('count'))
    .then(count => {
      t.equals(count.val, 2, 'derived db was resumed after derivation was set again')
    })
    .catch(err => {
      console.log(err)
      console.log(err.stack)
      t.fail()
    })
})
