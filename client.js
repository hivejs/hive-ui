var Client = require('hive-api-client')
  , page = require('page')

module.exports = setup
module.exports.consumes = ['auth']
module.exports.provides = ['ui']
function setup(plugin, imports, register) {
  var auth = imports.auth
  var ui = {
    start: function() {
      page()
    },
    page: page,
    baseURL: document.location.origin // XXX: Won't work if hive is loaded in a subdir
  }
  register(null, {ui: ui})
}
