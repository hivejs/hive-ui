var Client = require('hive-api-client')
  , page = require('page')
  , co = require('co')

module.exports = setup
module.exports.consumes = ['hooks']
module.exports.provides = ['ui']
function setup(plugin, imports, register) {
  var hooks = imports.hooks
  var ui = {
    start: function() {
      co(function*() {
        var opts = {}
        yield hooks.callHook('ui:start', opts)
        page(opts)
      }).then(function(){})
    },
    page: page,
    baseURL: document.location.origin // XXX: Won't work if hive is loaded in a subdir
  }
  register(null, {ui: ui})
}
