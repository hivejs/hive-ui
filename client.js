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
var page = require('page')
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

  var bootstrapLink = document.createElement('link')
  bootstrapLink.setAttribute('rel', "stylesheet")
  bootstrapLink.setAttribute('href', "/static/hive-ui/bootstrap/css/bootstrap.min.css")//"https://maxcdn.bootstrapcdn.com/bootstrap/3.3.5/css/bootstrap.min.css"
  document.head.appendChild(bootstrapLink)

  register(null, {ui: ui})
}
