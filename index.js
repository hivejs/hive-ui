/**
 * hive.js
 * Copyright (C) 2013-2015 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License version 2
 * as published by the Mozilla Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the Mozilla Public License
 * along with this program.  If not, see <https://www.mozilla.org/en-US/MPL/2.0/>.
 */
var path = require('path')
  , staticCache = require('koa-static-cache')
  , mount = require('koa-mount')
  , fs = require('fs')
  , build = require('./lib/build')

module.exports = setup
module.exports.consumes = ['hub', 'cli', 'http', 'hooks', 'config', 'importexport', 'ot', 'interfaceStream']
module.exports.provides = ['ui']

function setup(plugin, imports, register) {
  var hub = imports.hub
    , http = imports.http
    , hooks = imports.hooks
    , config = imports.config
    , importexport = imports.importexport
    , ot = imports.ot
    , interfaceStream = imports.interfaceStream
    , cli = imports.cli

  var ui = {
    modules: {}
  , externals: {}
  , externalized: {}
  , entries: {}
  , stylesheets: {}
  , staticDirs: {}
  , config: {}
  , localeDirs: {}
  , rootPath: process.cwd()
  , baseURL: config.get('ui:baseURL')
    /**
     * Register a client-side module
     */
  , registerModule: function(file) {
      //file = file.indexOf(this.rootPath) === 0? file.substr(this.rootPath.length+1) : file
      if(this.modules[file]) return true
      this.modules[file] = true
      return true
    }
    /**
     * Put this module in a separate
     * bundle that you have to load yourself
     */
  , externalizeModule: function(file) {
      if (this.externalized[file]) return true
      this.externalized[file] = true
      this.registerExternalModule(file)
      return true
    }
    /**
     * Exclude a module from being put
     * in the main bundle
     */
  , registerExternalModule: function(file) {
      if (this.externals[file]) return true
      this.externals[file] = true
      return true
    }
    /**
     * Register a javascript module that is added to
     * the browserify build as an entry file
     */
  , registerJavascript: function(file) {
      //file = file.indexOf(this.rootPath) === 0? file.substr(this.rootPath.length+1) : file
      if(this.entries[file]) return true
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
  , bootstrapMiddleware: function() {
      return function*(next) {
        if(yield this.cashed()) return
        this.type = 'text/html; charset=utf-8';
        this.body = fs.createReadStream('build/index.html')
      }
    }
  }

  ui.registerStaticDir(path.join(__dirname, 'bootstrap'))
  ui.registerStaticDir(path.join(__dirname, 'img'))
  
  ui.registerStylesheet(path.join(__dirname, 'css', 'index.css'))
  
  ui.registerJavascript('node_modules/babel-polyfill')
  ui.registerJavascript('node_modules/whatwg-fetch')
  ui.registerJavascript(__dirname+'/client/init.js')

  ui.registerModule(path.join(__dirname, 'client/ui.js'))
  ui.registerModule(path.join(__dirname, 'client/api.js'))
  ui.registerModule(path.join(__dirname, 'client/editor.js'))
  ui.registerModule(path.join(__dirname, 'client/session.js'))
  ui.registerModule(path.join(__dirname, 'client/settings.js'))
  ui.registerModule(path.join(__dirname, 'client/localize.js'))
  ui.registerModule(path.join(__dirname, 'client/oauth.js'))
  ui.registerModule(path.join(__dirname, 'client/authToken.js'))
  
  ui.registerLocaleDir(path.join(__dirname, 'locales'))
 
  fs.writeFileSync(__dirname+'/client/lib/primus.js', interfaceStream.primus.library())

  hub.on('ready', function() {

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

    // Add Content-Security-Policy
    http.use(function*(next) {
      this.response.header['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline' ; script-src 'self' 'unsafe-inline' ; style-src 'self' 'unsafe-inline' ; img-src * ; font-src 'self' ; connect-src 'self' ; media-src * ; frame-ancestors 'self' ; form-action 'self' ; referrer origin-when-cross-origin;"
      yield next
    })

    // main ui
    http.router.get('/documents/:id', ui.bootstrapMiddleware())

    // pass down available ottypes
    ui.registerConfigEntry('ot:types', Object.keys(ot.ottypes))

    // Static dirs
    
    http.router.get('/static/build/*', mount('/static/build', staticCache('build/')))
    
    var staticRoot = ui.rootPath+'/node_modules'
    Object.keys(ui.staticDirs).forEach(function(dir) {
      var dirName = path.posix.join('/static/', dir.substr(staticRoot.length).split(path.sep).join(path.posix.sep))
      http.router.get(dirName+'/*', mount(dirName, staticCache(dir, ui.staticDirs[dir])))
    })
  })

  cli.registerCommand('ui-build',(argv) => {
    build(ui)
  })

  register(null, {ui: ui})
}
