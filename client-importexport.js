var vdom = require('virtual-dom')
  , h = vdom.h
  , match = require('mime-match')

module.exports = setup
module.exports.consumes = ['ui', 'api']
module.exports.provides = ['importexport']

const EXPORTED = 'IMPORTEXPORT_EXPORTED'
const EXPORTING = 'IMPORTEXPORT_EXPORTING'
const TOGGLE_EXPORT_DROPDOWN = 'IMPORTEXPORT_TOGGLE_EXPORT_DROPDOWN'

const IMPORTED = 'IMPORTEXPORT_IMPORTED'
const IMPORTING = 'IMPORTEXPORT_IMPORTING'
const TOGGLE_IMPORT_DROPDOWN = 'IMPORTEXPORT_TOGGLE_IMPORT_DROPDOWN'

function setup(plugin, imports, register) {
  var ui = imports.ui
    , api = imports.api

  ui.reduxReducerMap.importexport = reducer

  function reducer(state, action) {
    if(!state) {
      return {
        exportTypes: ui.config['importexport:exportTypes']
      , importTypes: ui.config['importexport:importTypes']
      , showExportDropdown: false
      , showImportDropdown: false
      , exporting: false
      , exportError: false
      , importing: false
      , importError: false
      }
    }
    if(TOGGLE_EXPORT_DROPDOWN === action.type) {
      return {...state
      , showExportDropdown: !state.showExportDropdown
      , exportError: false
      }
    }
    if(EXPORTING == action.type) {
      return {...state, exporting: action.payload, exportError: false}
    }
    if(EXPORTED == action.type && action.error) {
      return {...state
      , exporting: false
      , exportError: action.error
      }
    }
    if(EXPORTED == action.type) {
      return {...state
      , exporting: false
      , showExportDropdown: false
      , exportError: false
      }
    }
    if(TOGGLE_IMPORT_DROPDOWN === action.type) {
      return {...state
      , showImportDropdown: !state.showImportDropdown
      , importError: false
      }
    }
    if(IMPORTING == action.type) {
      return {...state, importing: action.payload, importError: false}
    }
    if(IMPORTED === action.type && action.error) {
      return {...state, importing: false, importError: action.error}
    }
    if(IMPORTED == action.type) {
      return {...state
        , importing: false
        , importError: false
        , showImportDropdown: false
      }
    }
    return state
  }

  ui.reduxMiddleware.push(middleware)
  function middleware(store) {
    return next => action => {
      if(EXPORTED === action.type && !action.error) {
        var dataURI = URL.createObjectURL(action.payload.blob)
        download('export', dataURI)
      }
      return next(action)
    }
  }

  var importexport = {
    action_export: function *(exportType) {
      try {
      yield importexport.action_exporting(exportType)
      var documentId = ui.store.getState().editor.document.id
      var document = yield api.action_document_get(documentId)
      var blob = yield api.action_snapshot_export(document.latestSnapshot, exportType)
      yield {type: EXPORTED, payload: {type: exportType, blob}}
      }catch(e) {
        console.error(e)
        yield {type: EXPORTED, error: e.message}
      }
    }
  , action_import: function*(files) {
      var file = files[0]
        , state = ui.store.getState()
        , importTypes = state.importexport.importTypes[state.editor.document.type]
        , documentId = ui.store.getState().editor.document.id
      try {
        if(file.type && !importTypes.filter(match(file.type)).length) {
          throw new Error('File type not supported')
        }
        yield importexport.action_importing(file.name)
        yield api.action_document_import(documentId, file)
        yield {type: IMPORTED}
      }catch(e) {
        console.error(e)
        yield {type: IMPORTED, error: e.message}
      }
    }
  , action_toggleExportDropdown: function() {
      return {type: TOGGLE_EXPORT_DROPDOWN}
    }
  , action_toggleImportDropdown: function() {
      return {type: TOGGLE_IMPORT_DROPDOWN}
    }
  , action_exporting: function(type) {
      return {type: EXPORTING, payload:type}
    }
  , action_importing: function(filename) {
      return {type: IMPORTING, payload:filename}
    }
  , renderImport
  , renderImportDropdown
  , renderExport
  , renderExportDropdown
  }

  ui.onRenderNavbar((store, children) => {
    var state = store.getState()
    if(!state.editor.editor) return
    if(state.importexport.exportTypes[state.editor.document.type]) {
      children.unshift(renderExport(store))
    }
    if(state.importexport.importTypes[state.editor.document.type]) {
      children.unshift(renderImport(store))
    }
  })

  function renderImport(store) {
    var document = store.getState().editor.document
    var state = store.getState().importexport

    return h('li.dropdown'+(state.showImportDropdown? '.open' : ''), [
      h('a.dropdown-toggle', {
          href: 'javascript:void(0)'
        , 'ev-click': evt => store.dispatch(importexport.action_toggleImportDropdown())
        , id: 'exportMenu'
        , attributes: {
            'data-toggle': 'dropdown'
          , 'aria-haspopup': 'true'
          , 'aria-expanded': state.showImportDropdown? 'true' : 'false'
          }
        }
      , [ui._('importexport/import')(), h('span.caret') ]
      )
    , h('ul.dropdown-menu'
      , { attributes: {'aria-labelledby':'exportMenu'}
        }
      , renderImportDropdown(store)
      )
    ])
  }

  function renderImportDropdown(store) {
    var state = store.getState().importexport

    if(!window.File || !window.FileReader || !window.FileList || !window.Blob) {
      return h('li', h('a', ui._('importexport/import-browser-not-supported')()))
    }

    if(state.importing) {
      return h('li', h('a', ui._('importexport/importing')({file:state.importing})))
    }

    var children = []

    children.push(
      h('li', h('a', [
        h('input', {
          type: 'file'
        , 'ev-change': evt => {
            store.dispatch(importexport.action_import(evt.currentTarget.files))
          }
        })
      ]))
    )

    if(state.importError) {
      children.push(
        h('li', h('div.alert.alert-danger', [
          h('strong', 'Error!')
        , ' '+state.importError
        ]))
      )
    }

    return children
  }

  function renderExport(store) {
    var state = store.getState().importexport
    return h('li.dropdown'+(state.showExportDropdown? '.open' : ''), [
      h('a.dropdown-toggle', {
          href: 'javascript:void(0)'
        , 'ev-click': evt => store.dispatch(importexport.action_toggleExportDropdown())
        , id: 'exportMenu'
        , attributes: {
            'data-toggle': 'dropdown'
          , 'aria-haspopup': 'true'
          , 'aria-expanded': state.showDropdown? 'true' : 'false'
          }
        }
      , [ui._('importexport/export')(), h('span.caret') ]
      )
    , h('ul.dropdown-menu'
      , { attributes: {'aria-labelledby':'exportMenu'}
        }
      , renderExportDropdown(store)
      )
    ])
  }

  function renderExportDropdown(store) {
    var document = store.getState().editor.document
    var state = store.getState().importexport
    return (
      state.exportTypes[document.type].map(exportType => {
        return h('li', h('a'
        , { href:'javascript:void(0)'
          , 'ev-click': evt => store.dispatch(
              importexport.action_export(exportType))
          }
        , ui._('importexport/format-'+exportType.replace('/', '-'))()
        +(state.exporting === exportType?
            ' '+ui._('importexport/exporting')()
          : ''
        )
        ))
      })
    ).concat([
      state.exportError?
        h('li', h('div.alert.alert-danger', [
          h('strong', 'Error'), ' '+state.exportError
        ]))
      : ''
    ])
  }

  register(null, {importexport: importexport})
}

function download(filename, dataURI) {
  // Construct the <a> element
  var link = document.createElement("a");
  link.download = filename;
  // Construct the uri
  link.href = dataURI;
  document.body.appendChild(link);
  link.click();
  // Cleanup the DOM
  document.body.removeChild(link);
}
