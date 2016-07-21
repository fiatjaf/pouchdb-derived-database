pouchdb-derived-database
======

A utility to make it easy to create PouchDBs whose documents arbitrarily reflect those on a primary database.

In fact it is just a changes listener wrapper.

### Usage

```bash
npm install --save pouchdb-derived-database
```

```js
var PouchDB = require('pouchdb')
var upsert = require('pouchdb-utils').upsert
PouchDB.plugin(require('pouchdb-derived-database'))

var db = new PouchDB('primary-db')

db.setDerived('derived', function derivator (params) {
  // you can do anything in this function to have exact the data you want
  // in the secondary database.
  //
  // you must create or update documents on the derived database manually.
  // `upsert` is just a utility for update sugar that is present on
  // the 'pouchdb-utils' package -- it has nothing to do with this library.
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
  // this will ensure you'll have a derived database named 'stats'
  // that keeps two documents, a 'count' and a 'sum', always reflecting
  // the state of the primary database
}).then(derived => {
  setTimeout(function () {
    // this will stop the derivation process
    // until you restart it by calling db.setDerived again
    derived.stop()
  })
})

// `stats` is just a normal pouch database
// it can be accessed anywhere
var ddb = new PouchDB('stats')

// you add documents to the primary database, they get reflected on the secondary
db.bulkDocs([
  {_id: 'doesntmatter', val: 21},
  {_id: 'unimportant', val: 14}
])
  .then(() =>
    new Promise(resolve => setTimeout(resolve, 200))
    // give the derivation process some time
    // or you can listen to .changes on the derived db
  )
  .then(() => ddb.get('sum'))
  .then(sum => console.log(sum.val))
  // prints 35
```

### Other things

  * This plugin only adds a `.setDerived` method on all PouchDB databases.
  * When the primary database is destroyed, all its derived databases are destroyed too.
  * I recommend that you never update the primary database inside a derivation function. Please.
