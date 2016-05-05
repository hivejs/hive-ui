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
var url = require('url')
  , querystring = require('querystring')
  , vdom = require('virtual-dom')
  , h = vdom.h

module.exports = setup
module.exports.consumes = ['ui', 'session', 'api']
module.exports.provides = ['oauth']

function setup(plugin, imports, register) {
  var ui = imports.ui
    , session = imports.session
    , api = imports.api

  ui.reduxReducerMap.oauth = reducer

  function reducer(state, action) {
    if(!state) {
      return {
        active: false
      , redirect_uri: null
      , scope: null
      , done: false
      }
    }
    if('OAUTH_ACTIVATE' === action.type) {
      return {...state, done: false, active: true, ...action.payload}
    }
    if('OAUTH_GRANT' === action.type) {
      return {...state, done: true}
    }
    return state
  }

  ui.onRenderBody((store, children) => {
    var state = store.getState()
    if(state.oauth.active) children.push(render(store))
  })

  const middleware = store => next => action => {
    if(ui.route(action, '/authorize')) {
      session.onceLoggedIn(_ => {
        var thisURL = url.parse(document.location.toString(), true)
        ui.store.dispatch(oauth.action_activate(thisURL.query.redirect_uri, thisURL.query.scope, thisURL.query.state))
      })
      return next(action)
    }

    if('OAUTH_GRANT' !== action.type) {
      return next(action)
    }

    var state = store.getState()
    // Access granted
    if(action.payload) {
      redirect(responseURI(state.oauth.redirect_uri, {
        access_token: action.payload
      , token_type: 'bearer'
      , state: state.oauth.state
      }))
    }
    // access denied
    else {
      redirect(responseURI(state.oauth.redirect_uri, {error: 'access_denied'}))
    }
    return next(action)
  }
  ui.reduxMiddleware.push(middleware)

  var oauth = {
    action_activate: function(redirect_uri, scope, state) {
      return {type: 'OAUTH_ACTIVATE', payload: {redirect_uri, scope, state}}
    }
  , action_grant: function*(grant) {
      if(!grant) {
        return yield {type: 'OAUTH_GRANT', payload: false}
      }

      var state = ui.store.getState()
      var res = yield api.action_authenticate('token'
      , state.session.grant.access_token
      , state.oauth.scope
      )
      if(res.access_token) return yield {type: 'OAUTH_GRANT', payload: res.access_token}
      else return yield {type: 'OAUTH_GRANT', paload: false}
    }
  , render
  , renderAskPermission
  , renderRedirecting
  }

  function render(store) {
    var state = store.getState()

    if(!state.oauth.done) return renderAskPermission(store)
    else return renderRedirecting()
  }

  function renderAskPermission(store) {
    var state = store.getState()
    , app_url = url.parse(state.oauth.redirect_uri)
    , protocolWarn = app_url.protocol !== 'https:'

    return h('div.panel.panel-default', {style: {
      width:'20%',
      'min-width': '10cm',
      margin: '3cm auto'
    }}, [
      h('div.panel-heading', [
        h('h3',ui._('oauth/authorization-required')())
      ]),
      h('div.panel-body.form-inline', [
        h('p', ui._('oauth/hello')({user: state.session.user.attributes.name}))
      , h('p', ui._('oauth/authorization-explanation')({app_url: app_url.host}))
      , h('ul', state.oauth.scope? state.oauth.scope.split(' ').map(function(scope) {
            return h('li', scope)
          }): h('li', ui._('oauth/scope-all')())
        )
      , protocolWarn?
          h('div.alert.alert-warning', [
            h('strong', ui._('oauth/warning')())
          , ' '+ui._('oauth/warning-explanation')()])
        : ''
      , h('p', ui._('oauth/question')())
      , h('div.pull-right', [
          h('button.btn.btn-default', {attributes:{type: 'submit'},
            'ev-click': evt => store.dispatch(oauth.action_grant(false))
          }, ui._('oauth/deny')()), ' '
        , h('button.btn.btn-primary', {attributes:{type: 'submit'},
            'ev-click': evt => store.dispatch(oauth.action_grant(true))
          }, ui._('oauth/grant')())
        ])
      ])
    ])
  }

  function renderRedirecting() {
    return h('div.panel.panel-default', {style: {
      width:'20%',
      'min-width': '7.5cm',
      margin: '3cm auto'
    }}, [
      h('div.panel-body', [
        h('p', ui._('oauth/redirecting')())
      ])
    ])
  }

  register(null, {oauth})
}

function redirect(url) {
  window.location = url
}

function responseURI(redirect_uri, params) {
  return redirect_uri+'#'+querystring.stringify(params)
}
