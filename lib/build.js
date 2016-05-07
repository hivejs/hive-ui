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
var gulp = require('gulp')
var concat = require('gulp-concat')
var babelify = require('babelify')
var browserify = require('browserify')
var source = require('vinyl-source-stream')
var mkdirp = require('mkdirp')
var co = require('co')
var deap = require('deap')
var fs = require('fs')
var languages = require('languages')

var DIR = 'build/'

module.exports = function(ui) { 
  mkdirp.sync(DIR)

  // css bundle
  gulp
  .src(Object.keys(ui.stylesheets))
  .pipe(concat('bundle.css'))
  .pipe(gulp.dest(DIR))

  // Main js bundle
  
  var bundle = browserify({
    debug: true
  })

  Object.keys(ui.modules)
  .forEach(file => bundle.require(file))
  
  Object.keys(ui.entries)
  .forEach(file => bundle.add(file))
  
  Object.keys(ui.externals)
  .forEach(file => bundle.external(file))

  // Hack for primus to work. Tracking bug:
  // https://github.com/primus/primus/issues/464
  bundle.require('stream')
  bundle.require('util')
  
  bundle
  .transform('babelify', {
    presets: ['es2015', 'stage-2']
  , global: true
  , ignore: /node_modules\/(?!(hive-|redux|reducers|flux|ot-))|.*?primus\.js/
  })
  .plugin('minifyify', {
    map: 'bundle.js.map'
  , output: DIR+'bundle.js.map'
  })
  .bundle()
  .on("error", function (err) { console.log("Error: " + err.message); })
  .pipe(source('bundle.js'))
  .pipe(gulp.dest(DIR))

  // Compile external bundles

  Object.keys(ui.externalized)
  .forEach(module => {
    var bundle = browserify({debug: true})
    
    bundle.require(module)

    bundle
    .plugin('minifyify', {
      map: module+'.js.map'
    , output: DIR+module+'.js.map'
    })
    .bundle()
    .on("error", function (err) { console.log("Error: " + err.message); })
    .pipe(source(module+'.js'))
    .pipe(gulp.dest(DIR))
  })

  co(function*() { 
  try {
    
    // bundle locales
    
    var locales = {}
    yield Object.keys(ui.localeDirs).map(function*(dir) {
      var files = yield (cb) => fs.readdir(dir, cb)
      yield files.map(function*(file) {
        var buffer = yield (cb) => fs.readFile(dir+'/'+file, cb)
        var json = JSON.parse(buffer.toString('utf8'))
          , locale = file.split('.')[0]
        if(!locales[locale]) locales[locale] = {}
        deap.extend(locales[locale], json)
      })
    })
    yield (cb) => mkdirp(DIR+'locales/', cb)
    yield Object.keys(locales)
    .map(function*(locale) {
      deap.merge(locales[locale], locales['en'])
      yield (cb) => fs.writeFile(DIR+'locales/'+locale+'.json', JSON.stringify({[locale]: locales[locale]}), cb)
    })

    ui.registerConfigEntry('locales',
      Object.keys(locales)
      .reduce((o, locale) => {
        o[locale] = languages.getLanguageInfo(locale)
        return o
      }, {})
    )
    
    // Compile index.html
    
    var cssbundle = ui.baseURL+'/static/build/bundle.css'
      , jsbundle = ui.baseURL+'/static/build/bundle.js'
      , components = JSON.stringify(Object.keys(ui.modules))
      , config = JSON.stringify(ui.config)
    var html = '<!DOCTYPE html><html>'
     + '<head><title>Hive.js</title><meta charset="utf-8" />'
     + '<meta name="viewport" content="width=device-width,initial-scale=1" />'
     + '<link rel="stylesheet" href="'+cssbundle+'" />'
     + '</head>'
     + '<body>'
     + '<script>var HIVE_COMPONENTS='+components+', HIVE_CONFIG='+config+'</script>'
     + '<script src="'+jsbundle+'" id="bundlejs"></script>'
     + '</body>'
     + '</html>'
    yield (cb) => fs.writeFile(DIR+'index.html', html, cb)
  
  }catch(e){console.log(e.stack || e)}
  })
  .then(() => {})
  .catch((e) => {throw e})
}
