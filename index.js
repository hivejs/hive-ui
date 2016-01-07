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
  , browserify = require('browserify')
  , fs = require('fs')

module.exports = setup
module.exports.consumes = ['http', 'hooks', 'config']
module.exports.provides = ['ui']

function setup(plugin, imports, register) {
  var http = imports.http
    , hooks = imports.hooks
    , config = imports.config

  var b = browserify({debug: true, entries: ['node_modules/babel-polyfill']})
  b.transform('babelify', {
    presets: ['es2015', 'stage-2']
  , global: true
  , ignore: /node_modules\/(?!hive-)(?!redux)(?!reducers)(?!flux)/
  })

  var ui = {
    modules: {}
  , entries: {}
  , stylesheets: {}
  , dirs: {}
  , config: {}
  , rootPath: path.join(process.cwd(), 'node_modules')
    /**
     * Register a client-side module
     */
  , registerModule: function(file) {
     file = file.indexOf(this.rootPath) === 0? file.substr(this.rootPath.length+1) : file
     if(this.modules[file]) return true
     b.require(file)
     this.modules[file] = true
     return true
   }
    /**
     * Register a javascript module that is added to
     * the browserify build as an entry file
     */
  , registerJavascript: function(file) {
      file = file.indexOf(this.rootPath) === 0? file.substr(this.rootPath.length+1) : file
      if(this.entries[file]) return true
      b.add(file)
      b.require(file)
      this.entries[file] = true
      return true
    }
    /**
     * Register a stylesheet that will be appended to build.css
     */
  , registerStylesheet: function(file) {
      if(this.modules[file]) return true
      this.stylesheets[file] = true
      return true
    }
    /**
     * Register a static asset folder
     */
  , registerStaticDir: function(dir, options) {
     if(this.dirs[dir]) return true
     this.dirs[dir] = options||{}

     if(dir.indexOf(this.rootPath) !== 0) {
       throw new Error('Supplied path is not in the hive instance directory')
     }
    }
  , registerConfigEntry: function(name, val) {
      this.config[name] = val
    }
  , bundleStylesheets: function*() {
      return (yield Object.keys(ui.stylesheets)
      .map(function(file) {
        return function(cb) {
          fs.readFile(file, cb)
        }
      }))
      .join('\r\n')
    }
  , getBootstrapCode: function() {
      var baseURL = config.get('ui:baseURL')
        , buildpath = baseURL+'/build.js'
        , stylesheet = baseURL+'/build.css'
      var list = Object.keys(ui.modules).length? Object.keys(ui.modules).map(JSON.stringify).join(',') : ''
        , configString = JSON.stringify(this.config)
      return'<!DOCTYPE html><html><head><title>Hive.js</title><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><link rel="stylesheet" href="'+stylesheet+'" /></head><body><script src="'+buildpath+'" id="buildjs"></script><script>require("architect").createApp(['+list+'].map(function(file) {var module = require(file); if(typeof(module) != "function") throw new Error("Component "+file+" doesn\'t expose a setup function for registering."); return {packagePath: file, setup: module, provides: module.provides || [], consumes: module.consumes || []}}), function(er, app) {if(er) throw er; app.getService("ui").start('+configString+')})</script></body></html>'
    }
  , bootstrapMiddleware: function() {
      return function*(next) {
        if(yield this.cashed()) return
        this.body = ui.getBootstrapCode()
      }
    }
  , bundle: function*() {
      return yield function(cb) {
        b.bundle(cb)
      }
    }
  }

  b.require('architect')

  ui.registerStaticDir(path.join(__dirname, 'bootstrap'))
  ui.registerModule(path.join(__dirname, 'client.js'))

  hooks.on('http:listening', function*() {
    http.router.get('/build.css', function*() {
      if(yield this.cashed()) return
      this.type = 'text/css; charset=utf-8'
      this.body = yield ui.bundleStylesheets()
    })

    http.router.get('/build.js', function*() {
      if(yield this.cashed()) return
      this.body = yield ui.bundle()
    })

    Object.keys(ui.dirs).forEach(function(dir) {
      var dirName = path.posix.join('/static/', dir.substr(ui.rootPath.length).split(path.sep).join(path.posix.sep))
      http.router.get(dirName+'/*', mount(dirName, staticCache(dir, ui.dirs[dir])))
    })

    http.router.get('/documents/:id', ui.bootstrapMiddleware())
  })

  register(null, {ui: ui})
}
