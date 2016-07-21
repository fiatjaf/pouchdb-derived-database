var Promise = require('pouchdb-promise')
var promisedCallback = require('pouchdb-mapreduce-utils').promisedCallback
var upsert = require('pouchdb-utils').upsert

module.exports.setDerived = setDerived

function setDerived (name, fun, callback) {
  var db = this

  if (db.type() === 'http') {
    return Promise.resolve()
  }

  var promise = Promise.resolve().then(function () {
    return createDerived(name, db, fun)
      .then(function (derived) {
        startListening(derived)
        return derived
      })
  })

  promisedCallback(promise, callback)

  return promise
}

function startListening (derived) {
  var currentSeq = derived.seq || 0
  var queue = new TaskQueue()

  derived.sourceDB.changes({
    include_docs: true,
    since: currentSeq,
    live: true
  }).on('change', function (change) {
    if (change.doc._id[0] !== '_') {
      queue.add(function tryFun () {
        return derived.fun.call(null, {
          change: change,
          derivedDB: derived.db
        })
        .catch(function errorOnFun (err) {
          console.log(err)
          console.log(err.stack)
        })
        .then(function updateSeq () {
          return upsert(derived.db, '_local/lastSeq', function (doc) {
            doc.seq = change.seq
          })
        })
      })
    }
  }).on('error', function (err) {
    console.log(err)
    console.log(err.stack)
  })
}

function createDerived (name, sourceDB, fun) {
  var derivedDbName = name

  // save the derived name in the source db so it can be cleaned up if necessary
  // (when the source database is destroyed)
  return sourceDB.registerDependentDatabase(derivedDbName).then(function (res) {
    var db = res.db
    db.auto_compaction = true
    var derived = {
      name: derivedDbName,
      db: db,
      sourceDB: sourceDB,
      fun: fun
    }
    return derived.db.get('_local/lastSeq').catch(function (err) {
      if (err.status !== 404) {
        throw err
      }
    }).then(function (lastSeqDoc) {
      derived.seq = lastSeqDoc ? lastSeqDoc.seq : 0
      return derived
    })
  })
}

function TaskQueue () {
  this.promise = Promise.resolve()
}
TaskQueue.prototype.add = function (task) {
  this.promise = this.promise.catch(function (err) {
    console.log(err)
    console.log(err.stack)
  }).then(function () {
    return task()
  })

  return this.promise
}
TaskQueue.prototype.finish = function () {
  return this.promise
}
