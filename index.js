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
  , deap = require('deap')
  , languages = require('languages')

module.exports = setup
module.exports.consumes = ['http', 'hooks', 'config', 'importexport', 'ot']
module.exports.provides = ['ui']

function setup(plugin, imports, register) {
  var http = imports.http
    , hooks = imports.hooks
    , config = imports.config
    , importexport = imports.importexport
    , ot = imports.ot

  var b = browserify({debug: config.get('ui:debug') || false, entries: ['node_modules/babel-polyfill', 'node_modules/whatwg-fetch']})
  b.transform('babelify', {
    presets: ['es2015', 'stage-2']
  , global: true
  , ignore: /node_modules\/(?!hive-)(?!redux)(?!reducers)(?!flux)/
  })

  var ui = {
    modules: {}
  , entries: {}
  , stylesheets: {}
  , staticDirs: {}
  , config: {}
  , localeDirs: {}
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
      //file = file.indexOf(this.rootPath) === 0? file.substr(this.rootPath.length+1) : file
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
  , bundleStylesheets: function*() {
      return (yield Object.keys(ui.stylesheets)
      .map(function(file) {
        return function(cb) {
          fs.readFile(file, cb)
        }
      }))
      .join('\r\n')
    }
    /**
     * Register a static asset folder
     */
  , registerStaticDir: function(dir, options) {
     if(this.staticDirs[dir]) return true
     this.staticDirs[dir] = options||{}

     if(dir.indexOf(this.rootPath) !== 0) {
       throw new Error('Supplied path is not in the hive instance directory')
     }
    }
    /**
     * Register an entry for the config to be sent to the client
     */
  , registerConfigEntry: function(name, val) {
      this.config[name] = val
    }
    /**
     * Register a directory of locale.json files
     * See https://github.com/jquery/globalize/blob/master/doc/api/message/load-messages.md
     */
  , registerLocaleDir: function(dir) {
      if(this.localeDirs[dir]) return true
      this.localeDirs[dir] = true
    }
  , bundleLocales: function*() {
      var locales = {}
      yield Object.keys(this.localeDirs).map(function*(dir) {
        var files = yield function(cb) {
          fs.readdir(dir, cb)
        }
        yield files.map(function*(file) {
          var buffer = yield function(cb) {
            fs.readFile(dir+'/'+file, cb)
          }
          var json = JSON.parse(buffer.toString('utf8'))
            , locale = file.split('.')[0]
          if(!locales[locale]) locales[locale] = {}
          deap.extend(locales[locale], json)
        })
      })
      for(var locale in locales) {
        deap.merge(locales[locale], locales['en'])
      }
      return locales
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
  ui.registerStylesheet(path.join(__dirname, 'css', 'index.css'))
  ui.registerModule(path.join(__dirname, 'client-ui.js'))
  ui.registerModule(path.join(__dirname, 'client-api.js'))
  ui.registerModule(path.join(__dirname, 'client-editor.js'))
  ui.registerModule(path.join(__dirname, 'client-session.js'))
  ui.registerModule(path.join(__dirname, 'client-settings.js'))
  ui.registerModule(path.join(__dirname, 'client-localize.js'))
  ui.registerModule(path.join(__dirname, 'client-oauth.js'))
  ui.registerModule(path.join(__dirname, 'client-authToken.js'))
  ui.registerLocaleDir(path.join(__dirname, 'locales'))

  hooks.on('http:listening', function*() {
    http.router.get('/build.css', function*() {
      if(yield this.cashed()) return
      this.type = 'text/css; charset=utf-8'
      this.body = yield ui.bundleStylesheets()
    })

    Object.keys(ui.staticDirs).forEach(function(dir) {
      var dirName = path.posix.join('/static/', dir.substr(ui.rootPath.length).split(path.sep).join(path.posix.sep))
      http.router.get(dirName+'/*', mount(dirName, staticCache(dir, ui.staticDirs[dir])))
    })

    http.router.get('/documents/:id', ui.bootstrapMiddleware())

    // pass down Import export config

    var exportTypes = {}
    for(var docType in importexport.exports) {
      exportTypes[docType] = Object.keys(importexport.exports[docType])
    }
    ui.registerConfigEntry('importexport:exportTypes', exportTypes)

    var importTypes = {}
    for(var docType in importexport.imports) {
      importTypes[docType] = Object.keys(importexport.imports[docType])
    }
    ui.registerConfigEntry('importexport:importTypes', importTypes)


    // bundle + pass down locales & register locale routes

    var locales = yield ui.bundleLocales()

    ui.registerConfigEntry('locales', Object.keys(locales)
      .reduce((o, locale) => {
        o[locale] = languages.getLanguageInfo(locale)
        return o
      }, {})
    )

    http.router.get('/locales/:locale.json', function*(next) {
      if(!locales[this.params.locale]) this.throw(404)
      this.body = {[this.params.locale]: locales[this.params.locale]}
    })

    // pass down available ottypes
    ui.registerConfigEntry('ot:types', Object.keys(ot.ottypes))

    http.router.get('/build.js', function*() {
      if(yield this.cashed()) return
      this.body = yield ui.bundle()
    })
  })

  register(null, {ui: ui})
}
