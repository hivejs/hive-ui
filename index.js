var readFile = function(name) { return function(cb) {require('fs').readFile(name, cb)}}

module.exports = setup
module.exports.consumes = ['http', 'orm']

function setup(plugin, imports, register) {
  var http = imports.http
    , orm = imports.orm

  http.get('/document/:document', function*(next) {
    var document = orm.collections.document.findOne({id: this.params.document})
    if(!document) this.throw(404)
    this.set('content-type', 'text/html')
    this.body = yield readFile(__dirname+'/index.html')
  })
  
  register()
}
