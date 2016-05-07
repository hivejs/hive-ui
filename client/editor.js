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
var MuxDmx = require('mux-dmx')
  , vdom = require('virtual-dom')
  , h = vdom.h
  , createElement = vdom.create
  , newActionCreator = require('redux-actions').createAction
  , AtomicEmitter = require('atomic-emitter')

module.exports = setup
module.exports.consumes = ['ui', 'api', 'session', 'settings']
module.exports.provides = ['editor']
function setup(plugin, imports, register) {
  var ui = imports.ui
    , api = imports.api
    , session = imports.session
    , settings = imports.settings

  ui.reduxReducerMap.editor = reducer

  function reducer(state, action) {
    if(!state || 'EDITOR_DEACTIVATE' === action.type) {
      return {
        active: false
      , document: null
      , editor: null
      , notFound: null
      , loadError: null
      , loading: false
      }
    }
    if('EDITOR_ACTIVATE' === action.type) {
      return {...state, active: true, loading: 0.1}
    }
    if('EDITOR_DOCUMENT_LOAD' === action.type && action.error) {
      return {...state, notFound: true, loading: false}
    }
    if('EDITOR_DOCUMENT_LOAD' === action.type) {
      return {...state, document: action.payload, loading: false}
    }
    if('EDITOR_CHOOSE' === action.type) {
      return { ...state, editor: action.payload, loading: 0.4}
    }
    if('EDITOR_LOAD' === action.type && action.error) {
      return {...state, loadError: action.payload, loading: false}
    }
    if('EDITOR_LOAD' === action.type && !action.error) {
      return {...state, loading: 0.7}
    }
    if('EDITOR_INITIALIZED' === action.type) {
      return {...state, loading: false}
    }
    return state
  }

  ui.reduxMiddleware.push(function(store) {
    return next => action => {
      var params
      if(params = ui.route(action, '/documents/:id')) {
        session.onceLoggedIn(_ => {
          ui.store.dispatch(editor.action_activate())
          ui.store.dispatch(editor.action_loadDocument(params.id))
        })
      }
      if(ui.exitRoute(store, action, '/documents/:id')) {
        editor.closeEditor()
        ui.store.dispatch(editor.action_deactivate())
      }
      return next(action)
    }
  })

  var editor = {
    editors: {}
  , registerEditor: function(name, type, desc, editor) {
      this.editors[name] = {name: name, type: type, description: desc, setup: editor}
    }
  , closeEditor: function() {
      if(this.onClose) this.onClose.emit()
      this.el.innerHTML = ''
    }
  , createEditor: function(id, name) {
      this.closeEditor()

      this.onClose = AtomicEmitter()

      if(!this.editors[name]) {
        return Promise.reject(new Error('Editor not found'))
      }

      var registeredEditor = this.editors[name]
      try {
        // Setup editor
        var setupPromise = registeredEditor.setup(this.el, this.onClose)
      }catch(e) {
        setTimeout(function() {
          ui.store.dispatch(editor.action_loadError(e))
        }, 0)
        return
      }

      return Promise.race([
        setupPromise
      , timeoutPromise(10000)// 10 seonds timeout
      ])
      // Ensure stream is loaded
      .then((editableDoc) => new Promise((resolve) => {
        session.onceStreamConnected(() => resolve(editableDoc))
      }))
      .then(editableDoc => {
        if(!editableDoc) throw new Error('Loading timeout!')

        // setup broadcast
        var broadcast = MuxDmx()
        var upstreamBroadcast = session.stream.open('/document/'+id+'/broadcast')
        broadcast.pipe(upstreamBroadcast).pipe(broadcast)
        session.onStreamConnect(() => {
          broadcast.unpipe()
          upstreamBroadcast.unpipe()
          upstreamBroadcast = session.stream.open('/document/'+id+'/broadcast')
          broadcast.pipe(upstreamBroadcast).pipe(broadcast)
        })

        //link to the server
        var uplink = session.stream.open('/document/'+id+'/sync')
          , access_token = ui.store.getState().session.grant.access_token
          , masterLink
        uplink
        .pipe(masterLink = editableDoc.masterLink({credentials: access_token}))
        .pipe(uplink)
        session.onStreamConnect(() => {
          uplink.unpipe()
          masterLink.unpipe()
          uplink = session.stream.open('/document/'+id+'/sync')
          uplink.pipe(masterLink).pipe(uplink)
        })

        this.onClose(_=> {
          broadcast.unpipe()
          upstreamBroadcast.unpipe()
          uplink.unpipe()
          masterLink.unpipe()
        })

        ui.store.dispatch({type: 'EDITOR_LOAD'})

        editableDoc.once('editableInitialized', () =>
          ui.store.dispatch({type: 'EDITOR_INITIALIZED'}))

        editor.onLoad.emit(editableDoc, broadcast, this.onClose)
      })
      .catch(function(e) {
        ui.store.dispatch(editor.action_loadError(e))
      })
    }
  , action_activate: function() {
      return {type: 'EDITOR_ACTIVATE'}
    }
  , action_deactivate: function() {
      return {type: 'EDITOR_DEACTIVATE'}
    }
  , action_loadDocument: function*(id) {
      try {
        var doc = yield api.action_document_get(id)
      }catch(e) {
        return yield {type: 'EDITOR_DOCUMENT_LOAD', error: true, payload: e}
      }
      return yield {type: 'EDITOR_DOCUMENT_LOAD', payload: doc}
    }
  , action_chooseEditor: newActionCreator('EDITOR_CHOOSE')
  , action_loadError: function(e) {
      return {type: 'EDITOR_LOAD', error: true, payload: e}
    }
  , onLoad: AtomicEmitter()
  , render
  , renderLoadError
  , renderChooseEditor
  , renderNotFound
  , renderLoading
  }

  // create editor element
  editor.el = document.createElement('div')
  editor.el.setAttribute('id', 'editor')
  editor.el.style['display'] = 'flex'
  editor.el.style['flex-direction'] = 'column'

  ui.onRenderBody((store, children) => {
    var state = ui.store.getState()
    if(state.editor.active && state.editor.loading) {
      children.push(renderLoading(state.editor.loading))
    }
    if(state.editor.active) {
      children.push(render(ui.store))
    }
  })

  editor.onLoad(_=> {
    settings.onChange(_=> {
      if(!settings.getForUser('editor:editor')) return
      store.dispatch(
        editor.action_chooseEditor(settings.getForUser('editor:editor')))
    })
  })

  settings.onRenderUserDocumentSettings((children) => {
    children.push(renderSetting(ui.store))
  })

  function renderSetting(store) {
    var currentEditor = settings.getForUserDocument('editor:editor')
      , state = store.getState()
    return h('div', [
      h('h4', ui._('editor/editor')())
    , h('ul.list-group', [
        h('li.list-group-item', [
          h('label', [
            ui._('editor/editor')()+': '
          , h('select'
            , { 'ev-change': evt =>
                  store.dispatch(settings.action_setForUserDocument(
                    {'editor:editor': evt.currentTarget.value}
                  ))
              , value: currentEditor
              }
            , [h('option', {value: ''}, ui._('editor/select-editor')())]
              .concat(
                Object.keys(editor.editors)
                .filter(regEditor =>
                  editor.editors[regEditor].type == state.editor.document.type
                )
                .map(registeredEditor => {
                  return h('option'
                  , {value: registeredEditor, attributes: registeredEditor == currentEditor? {selected: true} : {}}
                  , registeredEditor)
                })
              )
            )
          ])
        ])
      ])
    ])
  }

  function render(store) {
    var state = store.getState()

    if(state.editor.loadError)
      return renderLoadError()

    // if editor is chosen and is initialized, display editor
    else if(state.editor.editor)
      return new EditorWidget(editor.el, state.editor.document.id, state.editor.editor)

    // if document is loaded, let the user choose editor
    else if(state.editor.document) {
      var chooseableEditors = Object.keys(editor.editors)
      .map(name => editor.editors[name])
      .filter(editor => editor.type === state.editor.document.attributes.type)

      if(chooseableEditors.length > 1) {
        var chosenEditor
        if(chosenEditor = settings.getForUserDocument('editor:editor'))
          setTimeout(function() {
            store.dispatch(editor.action_chooseEditor(chosenEditor))
          }, 50)
        else
          return renderChooseEditor(store)
      }else
        setTimeout(function() {
          store.dispatch(editor.action_chooseEditor(chooseableEditors[0].name))
        }, 50)
    }

    else if(state.editor.notFound)
      return renderNotFound()

    return h('div') // return empty and hope 'loading' is displayed :)
  }

  function renderChooseEditor(store) {
    var state = store.getState()
      , type = state.editor.document.type
    return h('div.panel.panel-default', {style: {
      width:'20%',
      'min-width': '7.5cm',
      margin: '3cm auto'
    }}, [
      h('div.panel-heading', [
        h('h3', ui._('editor/choose-editor')())
      ]),
      h('div.panel-body', [
        h('p', ui._('editor/choose-editor-explanation')({type}))
      ]),
      h('ul.list-group', Object.keys(editor.editors)
        .map(name => editor.editors[name])
        .filter(editor => editor.type === type)
        .map(registeredEditor => {
          return h('li.list-group-item', [
            h('a', {
              href: 'javascript:void(0)'
            , 'ev-click': evt => store.dispatch(editor.action_chooseEditor(registeredEditor.name))
            }
            , registeredEditor.name)
          , ' '+registeredEditor.description
          ])
        })
      )
    ])
  }

  function renderNotFound() {
    return h('div.alert.alert-danger', {role:'alert'}, [
      h('strong', ui._('editor/not-found')())
    , ' '+ui._('editor/not-found-explanation')()
    ])
  }

  function renderLoadError() {
    return h('div.alert.alert-danger', {role:'alert'}, [
      h('strong', ui._('editor/load-error')())
    , ' '+ui._('editor/load-error-explanation')()
    ])
  }

  function renderLoading(percent) {
    return h('div', {style: {
      width:'20%',
      'min-width': '7.5cm',
      margin: '3cm auto'
    }}, h('div.progress',
      h('div.progress-bar', {attributes: {
        role:"progressbar"
      , 'aria-valuenow': percent*100
      , 'aria-valuemin': 0
      , 'aria-valuema': 100
      , style:"width: "+(percent*100)+"%;"
      }}, h('span.sr-only', ui._('editor/loading')({progress: percent*100})))
    ))
  }

  var EditorWidget = function (node, documentId, editor) {
    this.node = node
    this.documentId = documentId
    this.editor = editor
    this.key = 1
  }
  EditorWidget.prototype.type = "Widget"
  EditorWidget.prototype.init = function() {
    editor.createEditor(this.documentId, this.editor)
    return this.node
  }
  EditorWidget.prototype.update = function(previous, domNode) {
    if(previous.documentId != this.documentId || previous.editor != this.editor) {
      editor.createEditor(this.documentId, this.editor)
    }
    return null // meaning: don't touch this!
  }
  EditorWidget.prototype.destroy = function(domNode) { }


  register(null, {editor: editor})
}

function timeoutPromise(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms)
  })
}
