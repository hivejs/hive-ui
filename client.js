var Client = require('hive-api-client')

module.exports = setup
module.exports.consumes = ['auth']
module.exports.provides = ['ui']
function setup(plugin, imports, register) {
  var auth = imports.auth
  var ui = {
    start: function() {
      var apiKey
      if(Object.keys(auth.authentication).length) {
        
      }else{
        apiKey = 'foobar'
      }
      var api = Client(document.location.origin, apiKey) // XXX: Will not work if hive is installed in a sub directory
      var pathname = window.location.pathname
        , docId = pathname.split('/')[pathname.split('/').length-1]
      api.document.get(docId, function(er, doc) {
        if(er) {
          api.document.create('plaintext', cb)
        }
        cb(null, doc)
        function cb(er, doc) {
          if(er) throw er
        }
      })
    }
  }
  register(null, {ui: ui})
}
