var path = require('path')

module.exports = setup
module.exports.consumes = ['assets']

function setup(plugin, imports, register) {
  var assets = imports.assets

  assets.registerModule(path.join(__dirname, 'client.js'))

  register()
}
