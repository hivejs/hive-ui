module.exports = setup
module.exports.consumes = ['assets']

function setup(plugin, imports, register) {
  var assets = imports.assets

  assets.registerModule(__dirname+'/client.js')

  register()
}
