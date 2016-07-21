pouchdb-derived-database
======

Utility to make it easy to create PouchDBs derived from other PouchDBs.

In fact it is just a changes listener.

### Usage

```bash
npm install --save pouchdb-derived-database
```

```js
PouchDB.plugin(require('pouchdb-derived-database'))

var db = new PouchDB('primary-db')

var derived = db.setDerived('secondary', function (derivedDB, change}) {
  // you can do anything in this function to have exact the data you want
  // in the secondary database.
  upsert(derivedDB, 'super-doc', function (doc) {
    doc.everything = doc.everything || []
    doc.everything.push(change.doc)
    return doc
  })
}).db

derived.get('super-doc')

// `secondary` is just a common pouch database
derived = new PouchDB('secondary')
```
