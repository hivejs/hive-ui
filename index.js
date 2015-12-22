/**
 * hive.js
 * Copyright (C) 2013-2015 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var path = require('path')
  , staticCache = require('koa-static-cache')
  , mount = require('koa-mount')

module.exports = setup
module.exports.consumes = ['assets', 'http', 'hooks']

function setup(plugin, imports, register) {
  var assets = imports.assets
    , http = imports.http
    , hooks = imports.hooks

  assets.registerStylesheet(path.join(__dirname, 'bootstrap/css/bootstrap.min.css'))
  assets.registerModule(path.join(__dirname, 'client.js'))

  hooks.on('http:listening', function*() {
    http.router.get('/build.css', function*() {
      if(yield this.cashed()) return
      this.type = 'text/css; charset=utf-8'
      this.body = yield assets.bundleStylesheets()
    })

    http.router.get('/build.js', function*() {
      if(yield this.cashed()) return
      this.body = yield assets.bundle()
    })

    Object.keys(assets.dirs).forEach(function(dir) {
      var dirName = path.posix.join('/static/', dir.substr(assets.rootPath.length).split(path.sep).join(path.posix.sep))
      http.router.get(dirName+'/*', mount(dirName, staticCache(dir, assets.dirs[dir])))
    })

    http.router.get('/documents/:id', assets.bootstrapMiddleware())
  })

  register()
}
