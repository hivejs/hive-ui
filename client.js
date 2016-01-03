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
  , AtomicEmitter = require('atomic-emitter')
  , vdom = require('virtual-dom')
  , h = vdom.h
  , domDelegator = require('dom-delegator')()
  , redux = require('redux')
  , reduxGen = require('redux-gen')
  , reducerMiddleware = require('./reducer-middleware')

// Determine baseURL
var src = document.getElementById('buildjs').getAttribute('src')
, baseURL = src.substr(0, src.lastIndexOf('/build.js'))

// Include bootstrap
var link = document.createElement('link')
link.setAttribute('href', baseURL+'/static/hive-ui/bootstrap/css/bootstrap.min.css')
link.setAttribute('rel', 'stylesheet')
document.head.insertBefore(link, document.head.firstChild)

module.exports = setup
module.exports.consumes = []
module.exports.provides = ['ui']
function setup(plugin, imports, register) {
  var ui = {
    start: function() {
      var reducerMap = {}
      ui.onStart.emit(reducerMap)
      ui.reduxReducers.push(redux.combineReducers(reducerMap))
      var createStore = redux.applyMiddleware.call(null, ui.reduxMiddleware)(redux.createStore)
      ui.store = createStore(reducerMiddleware(ui.reduxReducers))
      main() // kick off rendering
      ui.page()
      ui.onReady.emit()
    }
  , onRenderNavbar: AtomicEmitter()
  , onRenderBody: AtomicEmitter()
  , onStart: AtomicEmitter()
  , onReady: AtomicEmitter()
  , page: page
  , baseURL: baseURL
  , reduxMiddleware: [reduxGen]
  , reduxReducers: []
  }

  var dispose
  ui.page(function(ctx, next) {
    if(ctx.state.appState) {
      ui.store.dispatch(ui.action_loadState(ctx.state.appState))
    }else{
      ui.store.dispatch(ui.action_route(ctx.path))
    }

    // when the state changes, save it
    dispose = ui.store.subscribe(function() {
      ctx.appState = ui.store.getState()
      ctx.save()
    })

    next()
  })
  ui.page.exit(function() {
    dispose()
  })


  function main() {
    var tree = render(ui.store.getState())
      , rootNode = document.body
    rootNode.innerHTML = ''
    vdom.patch(rootNode, vdom.diff(h('body'), tree))

    // as the sate changes, the page will be re-rendered
    ui.store.subscribe(function(snapshot) {
      var newtree = render(snapshot)
      vdom.patch(rootNode, vdom.diff(tree, newtree))
      tree = newtree
    })
  }

  function render(store) {
    return h('body', [
      renderNavbar(store)
    , renderBody(store)
    ])
  }

  function renderNavbar(store) {
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
            extensible('onRenderNavbar', store, [])
          )
        ])
      ])
    ])
  }

  function renderBody(store) {
    var state = store.getState()
    return h('div.body', {style: {
        position: 'absolute'
      , top: '50px'
      , left: '0px'
      , bottom: '0px'
      , right: '0px'
      }},
      extensible('onRenderBody', store, state.errors.map(function(error) {
        return h('.div.alert.alert-danger', {role:"alert"}, error)
      }))
    )
  }

  function extensible(hookName, store, children) {
    ui[hookName].emit(store, children)
    return children
  }

  register(null, {ui: ui})
}
