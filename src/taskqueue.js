module.exports = TaskQueue

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
