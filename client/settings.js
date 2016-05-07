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
var vdom = require('virtual-dom')
  , h = vdom.h
  , createElement = vdom.create
  , AtomicEmitter = require('atomic-emitter')

const SET_FOR_DOCUMENT = 'SETTINGS_SET_FOR_DOCUMENT'
const SET_FOR_USER = 'SETTINGS_SET_FOR_USER'
const SET_VIEW = 'SETTINGS_SET_VIEW'
const DEACTIVATE = 'SETTINGS_DEACTIVATE'

module.exports = setup
module.exports.consumes = ['ui', 'api']
module.exports.provides = ['settings']
function setup(plugin, imports, register) {
  var ui = imports.ui
    , api = imports.api

  ui.reduxReducerMap.settings = reducer
  function reducer(state, action) {
    if(!state) {
      return {
        active: false
      }
    }
    if(SET_VIEW === action.type) {
      return {...state, active: action.payload}
    }
    if(DEACTIVATE === action.type) {
      return {...state, active: false}
    }
    return state
  }

  ui.reduxRootReducers.push(function(state, action) {
    if(SET_FOR_DOCUMENT === action.type) {
      return {...state, editor: {
        ...state.editor
      , document: {
          ...state.editor.document
        , attributes: {
            ...state.editor.document.attributes
          , settings: action.payload
          }
        }
      }}
    }
    if(SET_FOR_USER === action.type) {
      return {...state, session: {
        ...state.session
      , user: {
          ...state.session.user
        , attributes: {
          ...state.session.user.attributes
          , settings: action.payload
          }
        }
      }}
    }
    return state
  })

  ui.onStart(_=> {
    var user, document
    ui.store.subscribe(_=> {
      var state = ui.store.getState()
      if(deepEqual(state.session.user, user) && deepEqual(state.editor.document, document)) return
      document = state.editor.document
      user = state.session.user
      setImmediate(_=> {
        settings.onChange.emit()
      })
    })
  })

  var settings = {
    action_setForDocument: function*(hash) {
      var document = ui.store.getState().editor.document
      if(!document) throw new Error('No document loaded')
      yield api.action_document_update(
        document.id
      , {settings: {...document.attributes.settings, ...hash}}
      )
      yield {type: SET_FOR_DOCUMENT, payload: {...document.attributes.settings, ...hash}}
    }
  , getForDocument: function(key) {
      return ui.store.getState().editor.document.attributes.settings?
        ui.store.getState().editor.document.attributes.settings[key]
      : null
    }
  , action_setForUser: function*(hash) {
      var user = ui.store.getState().session.user
      if(!user) throw new Error('Not logged in')
      yield api.action_user_update(
        user.id
      , {settings: {...user.attributes.settings, ...hash}}
      )
      yield {type: SET_FOR_USER, payload: {...user.attributes.settings, ...hash}}
    }
  , getForUser: function(key) {
      var user = ui.store.getState().session.user
      if(!user) throw new Error('Not logged in')
      return user.attributes.settings?
        user.attributes.settings[key]
      : null
    }
  , action_setForUserDocument: function*(hash) {
      var document = ui.store.getState().editor.document
      if(!document) throw new Error('No document loaded')

      var newhash = {}
      for(var setting in hash) {
        newhash['document/'+document.id+':'+setting] = hash[setting]
      }

      yield* this.action_setForUser(newhash)
    }
  , getForUserDocument: function(key) {
      var document = ui.store.getState().editor.document
      if(!document) throw new Error('No document loaded')

      return this.getForUser('document/'+document.id+':'+key)
    }

  , action_setView: function(view) {
      return {type: SET_VIEW, payload: view}
    }
  , render
  , onRenderUserSettings: AtomicEmitter()
  , onRenderDocumentSettings: AtomicEmitter()
  , onRenderUserDocumentSettings: AtomicEmitter()
  , onChange: AtomicEmitter()
  }


  ui.onRenderNavbarRight((store, children) => {
    if(!store.getState().session.user) return
    children.push(
      h('li', h('a', {
        href: 'javascript:void(0)'
      , 'ev-click': evt => ui.store.dispatch(settings.action_setView('User'))
      , title: ui._('settings/settings')()
      }, [
        h('i.glyphicon.glyphicon-cog')
      , h('span.sr-only', ui._('settings/settings')())
      ]))
    )
  })

  ui.onRenderBody((store, children) => {
    if(store.getState().settings.active) children.push(render(store))
  })

  function render(store) {
    var state = store.getState()
    return h('div.Settings.panel.panel-default', [
      h('div.panel-heading', [
        h('a.glyphicon.glyphicon-remove.Settings__close', {
          href:'javascript:void(0)'
        , 'ev-click': ev => store.dispatch(settings.action_setView(false))
        })
      , h('h3',ui._('settings/settings')())
      ]),
      h('div.panel-body', [
        h('ul.nav.nav-tabs.nav-justified',{style:{'margin-bottom': '10px'}},[
          h('li.Settings__User_Tab'+(state.settings.active=='User'? '.active': ''), h('a'
          , { href: 'javascript:void(0)'
            , 'ev-click': evt => store.dispatch(settings.action_setView('User'))
            }
          , ui._('settings/user-settings')()))
        , state.editor.document?
          h('li.Settings__Document_Tab'+(state.settings.active=='Document'? '.active': ''), h('a'
          , { href: 'javascript:void(0)'
            , 'ev-click': evt => store.dispatch(settings.action_setView('Document'))
            }
          , ui._('settings/document-settings')()))
          : ''
        , state.editor.document?
          h('li.Settings__UserDocument_Tab'+(state.settings.active=='UserDocument'? '.active': ''), h('a'
          , { href: 'javascript:void(0)'
            , 'ev-click': evt => store.dispatch(settings.action_setView('UserDocument'))
            }
          , ui._('settings/personal-document-settings')()))
          : ''
        ])
      , h('div.Settings__'+state.settings.active, extend([]))
      ])
    ])

    function extend(children) {
      settings['onRender'+state.settings.active+'Settings'].emit(children)
      return children
    }
  }

  register(null, {settings: settings})
}

function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2)
}
