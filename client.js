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
    page: page
  }
  register(null, {ui: ui})
}
