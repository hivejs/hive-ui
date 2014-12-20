var readFile = function(name) {return function(cb) {require('fs').readFile(name, cb)}}

module.exports = setup
module.exports.consumes = ['http', 'orm']

function setup(plugin, imports, register) {
  var http = imports.http

  http.get('/document/:document', function*(next) {
    this.set('content-type', 'text/html')
    this.body = yield readFile(__dirname+'/index.html')
  })

  register()
}
