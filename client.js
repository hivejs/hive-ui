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
  , ObservVarhash = require('observ-varhash')
  , ObservEmitter = require('observ-emitter')
  , vdom = require('virtual-dom')
  , h = vdom.h
  , domDelegator = require('dom-delegator')()
  , url = require('url')
  , cookie = require('tiny-cookie')

var Client = require('hive-client-rest-api')
  , Stream = require('hive-client-shoe')

module.exports = setup
module.exports.consumes = ['hooks', 'auth', 'models']
module.exports.provides = ['ui']
function setup(plugin, imports, register) {
  var hooks = imports.hooks
    , auth = imports.auth
    , models = imports.models

  var src = document.getElementById('buildjs').getAttribute('src')
    , baseURL = src.substr(0, src.lastIndexOf('/build.js'))
  var loadState = null
  var ui = {
    start: function() {
      co(function*() {
        var opts = {}
        yield hooks.callHook('ui:start', opts)
        ui.page(main) // Register catch-all route, for kicking off rendering
        ui.page(opts)
      }).then(function(){})
    }
  , login: function() {
      return function(ctx, next) {
        co(function*() {
          if(!ui.state.grant) {
            var grant = yield auth.authenticate(ui.baseURL)
            // remember token for future use
            var basePath = url.parse(baseURL).pathname
            cookie.set('token', grant.access_token, {path: basePath})
            ui.state.put('grant', grant)
          }

          ctx.client = Client(ui.baseURL, ui.state.grant.access_token)
          window.client = ctx.client

          yield function(cb) {
            ctx.stream = Stream(ui.baseURL, ui.state.grant.access_token, cb)
          }

          ctx.models = yield models.load(ctx.client)

          ui.state.put('user', models.toObserv(new ctx.models.user({id: ui.state.grant.user})))
          yield function(cb) {
            ui.state.user.fetch({
              success: function(){cb()}
            , error: function(m, resp){cb(new Error('Server returned '+resp.status))}
            })
          }
          next()
        }).then(function() {})
      }
    }
  , page: page
  , baseURL: baseURL
  , state: ObservVarhash({ })
  , loadState: function(state) {
      loadState = state
      ui.page(state.path)
    }
  }

  ui.page(function(ctx, next) {
    // initialize state
    if(loadState) {
      ui.state.set(loadState)
      loadState = null
    }else if(ctx.state.appState) {
      // get it from pushState
      ui.state.set(ctx.state.appState)
    }else{
      // Should we really discard everything here?
      // At least a reset of the events is necessary
      var state = {
        path: ctx.path
      }
      ui.state.set(state)
    }

    ui.state.put('events', ObservVarhash({
      'ui:renderNavbar': ObservEmitter()
    , 'ui:renderBody': ObservEmitter()
    }))

    ui.state.put('errors', [])

    co(function *() {
      yield hooks.callHook('ui:initState', ui.state)
    }).then(next, function(er) {throw er})
  })

  function main(ctx) {
    var tree = render(ui.state())
      , rootNode = document.body
    rootNode.innerHTML = ''
    vdom.patch(rootNode, vdom.diff(h('body'), tree))

    // as the sate changes, the page will be re-rendered
    ui.state(function(snapshot) {
      var newtree = render(snapshot)
      vdom.patch(rootNode, vdom.diff(tree, newtree))
      tree = newtree
    })

    // when the state changes,
    ui.state(function() {
      ctx.appState = ui.state()
      ctx.save()
    })
  }

  function render(state) {
    return h('body', [
      renderNavbar(state)
    , renderBody(state)
    ])
  }

  function renderNavbar(state) {
    return h('div.navbar.navbar-default.navbar-static-top', [
      h('div.container-fluid', [
        h('div.navbar-header', [
          h('button.navbar-toggle.collapsed', { attributes:
            { type:"button"
            , "data-toggle":"collapse"
            , "data-target":"#navigation"
            , "aria-expanded":"false"
            }
          },
          [
          h('span.sr-only', 'Toggle navigation'),
          h('span.icon-bar'),
          h('span.icon-bar'),
          h('span.icon-bar'),
          ]),
          h('a.navbar-brand', {href:"#"}, 'Hive')
        ]),
        h('div.collapse.navbar-collapse', {attributes: {id:'navigation'}},[
          h('ul.nav.navbar-nav.navbar-right',
            extensible('ui:renderNavbar', state, [])
          )
        ])
      ])
    ])
  }

  function renderBody(state) {
    return h('div.body', {style: {
        position: 'absolute'
      , top: '50px'
      , left: '0px'
      , bottom: '0px'
      , right: '0px'
      }},
      extensible('ui:renderBody', state, state.errors.map(function(error) {
        return h('.div.alert.alert-danger', {role:"alert"}, error)
      }))
    )
  }

  function extensible(hookName, state, children) {
    state.events[hookName](state, children)
    return children
  }

  register(null, {ui: ui})
}
