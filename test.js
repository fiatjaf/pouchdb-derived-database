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
  var derivedDB

  db.bulkDocs(docs)
    .then(() => {
      return db.setDerived('sum', function derivator (params) {
        var ddb = params.derivedDB
        var groupName = params.change.doc.group
        return upsert(ddb, groupName, (doc) => {
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
