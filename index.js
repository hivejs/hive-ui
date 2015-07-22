var path = require('path')

module.exports = setup
module.exports.consumes = ['assets', 'http', 'hooks']

function setup(plugin, imports, register) {
  var assets = imports.assets
    , http = imports.http
    , hooks = imports.hooks

  assets.registerModule(path.join(__dirname, 'client.js'))
  
  hooks.on('http:listening', function*() {
    http.get('/build.js', function*() {
      if(this.cached && (yield this.cached())) return
      this.body = yield assets.bundle()
    })

    http.get('/:id', assets.bootstrapMiddleware())
  })

  register()
}
