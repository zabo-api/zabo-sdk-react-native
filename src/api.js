'use strict'

import { Linking, NativeModules, Platform } from 'react-native'
import axios from 'axios'

import constants from 'zabo-sdk-js/src/constants'
import resources from 'zabo-sdk-js/src/resources'
import utils from 'zabo-sdk-js/src/utils'
import { SDKError } from 'zabo-sdk-js/src/err'

import {
  getUrlParam,
  authSessionIsNativelySupported,
  openAuthSessionAsync,
  openAuthSessionPolyfillAsync,
  closeAuthSessionPolyfillAsync
} from './utils'

import { CONNECTION_FAILURE, CONNECTION_SUCCESS, DEBUG_REQUESTS } from './constants'

const { RNInAppBrowser } = NativeModules

class API {
  constructor (options) {
    Object.assign(this, options)

    if (!this.env) {
      throw new SDKError(
        400, '[Zabo] Please provide an \'env\' value when initializing Zabo. More details at: https://zabo.com/docs'
      )
    }

    const urls = constants(this.baseUrl, this.connectUrl, this.apiVersion)[this.env]
    this._account = null
    this._isConnecting = false
    this._isConnectorOpen = false
    this.baseUrl = urls.API_BASE_URL
    this.axios = axios.create()
    this.axios.defaults.baseURL = this.baseUrl

    if (DEBUG_REQUESTS) {
      this.axios.interceptors.request.use(request => {
        console.log('Request:', request.url, request)
        return request
      })

      this.axios.interceptors.response.use(response => {
        console.log('Response:', response.data, response)
        return response
      })
    }

    this.connectUrl = urls.CONNECT_BASE_URL
    resources(this, false).then(resources => { this.resources = resources })

    this._onConnectorMessage = this._onMessage.bind(this, 'connector')
    this._onSocketMessage = this._onMessage.bind(this, 'socket')
  }

  async connect ({ provider, params } = {}) {
    if (provider && typeof provider !== 'string') {
      throw new SDKError(400, '[Zabo] `provider` must be a string. More details at: https://zabo.com/docs/#preselected-provider-connections')
    }

    if (params && typeof params !== 'object') {
      throw new SDKError(400, '[Zabo] `params` must be an object. More details at: https://zabo.com/docs/#new-account-connections')
    }

    this._deleteAccountSession()
    this._isConnecting = true

    try {
      await this.axios.head(`${this.connectUrl}/health-check`)

      let redirectUri = ''
      if (params && params.redirect_uri) {
        redirectUri = params.redirect_uri
        params.redirect_uri = encodeURIComponent(params.redirect_uri)
      }

      const connectParams = {
        client_id: this.clientId,
        origin: 'zabo-sdk-react-native',
        zabo_env: this.env,
        zabo_version: this.apiVersion || 'v1',
        ...(params || {}),
        navbar: false
      }

      const teamSession = await this.resources.teams.getSession()
      if (teamSession) {
        connectParams.otp = teamSession.one_time_password
      }

      let url = `${this.connectUrl}/connect`
      url += (provider && typeof provider === 'string') ? `/${provider}` : ''
      url += `?${new URLSearchParams(connectParams).toString()}`

      this._setListeners(teamSession)
      this._isConnectorOpen = true
      const data = await this.openUrl(url, redirectUri)
      this._isConnectorOpen = false
      // In case websocket fails
      if (this._isConnecting) {
        if (data) {
          this._onMessage('connector', { data: { eventName: 'connectSuccess', zabo: true, account: { ...data } } })
        } else {
          this._onMessage('connector', { data: { eventName: 'connectError', zabo: true, error: { error_type: 500, message: 'Connection refused' } } })
        }
      }
    } catch (err) {
      console.log(err)
      this._triggerCallback(CONNECTION_FAILURE, { error_type: 500, message: 'Connection refused' })
    }
  }

  async openUrl (url = '', redirectUri = '') {
    try {
      if (await this._isConnectAvailable()) {
        const options = {
          ephemeralWebSession: false,
          animated: false
        }
        const res = await this._openAuth(url, redirectUri, options)
        if (res.type === 'success') {
          try {
            return JSON.parse(getUrlParam('account', res.url))
          } catch (err) {
            this._triggerCallback(CONNECTION_FAILURE, { error_type: 500, message: 'Could not parse session data' })
          }
        } else if (res.type === 'cancel') {
          this._triggerCallback(CONNECTION_FAILURE, { error_type: 400, message: 'Connection closed' })
        }
      } else {
        Linking.openURL(url)
      }
    } catch (err) {
      console.log(err)
      this._triggerCallback(CONNECTION_FAILURE, { error_type: 500, message: 'Could not open the Connection Widget' })
    }

    return null
  }

  async request (method, path, data, isPublic = false) {
    const request = this._buildRequest(method, path, data, isPublic)

    try {
      const response = await this.axios(request)

      if (response.data && response.data.list_cursor) {
        return utils.createPaginator(response.data, this)
      }
      return response.data
    } catch (err) {
      if (err.response) {
        throw new SDKError(err.response.status, err.response.data.message, err.response.data.request_id)
      }
      throw new SDKError(500, err.message)
    }
  }

  _buildRequest (method, path, data, isPublic) {
    const url = this.baseUrl + path
    const _account = this._getAccountSession()
    let headers = {}

    if (!isPublic && _account) {
      headers = { Authorization: 'Bearer ' + _account.token }
    }
    method = method.toLowerCase()

    return { method, url, data, headers }
  }

  _setListeners (teamSession) {
    if (teamSession) {
      let wsUrl = this.baseUrl.replace('https://', 'wss://')
      wsUrl += wsUrl.substr(-1) === '/' ? 'ws' : '/ws'
      wsUrl += `?client_id=${this.clientId}`
      wsUrl += `&otp=${teamSession.one_time_password}`

      try {
        this.ws = new WebSocket(wsUrl)
        this.ws.onmessage = this._onSocketMessage
      } catch (err) {
        console.warn('[Zabo] Error establishing WebSocket connection.', err.message)
      }
    }
  }

  _removeListeners () {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  _onMessage (emitter, { origin, data }) {
    try {
      data = JSON.parse(data)
    } catch (err) { }

    if (data.zabo) {
      switch (data.eventName) {
        case 'connectSuccess': {
          if (data.account && data.account.token) {
            this._setAccountSession(data.account)
          }

          if (this.resources.accounts && this.resources.transactions) {
            this.resources.accounts._setAccount(data.account)
            this.resources.transactions._setAccount(data.account)
            this.resources.trading._setAccount(data.account)
          }

          this._triggerCallback(CONNECTION_SUCCESS, data.account)

          this._removeListeners()
          this._closeConnector()
          break
        }

        case 'connectError': {
          this._triggerCallback(CONNECTION_FAILURE, data.error)

          this._removeListeners()
          this._closeConnector()
          break
        }

        case 'connectClose': {
          this._removeListeners()
          this._closeConnector()
          break
        }

        default: {
          if (this._onEvent) {
            this._onEvent(data.eventName, data.metadata || {})
          }
        }
      }
    }
  }

  _setAccountSession (account) {
    this._account = account
  }

  _getAccountSession () {
    return this._account
  }

  _deleteAccountSession () {
    this._account = null
  }

  _closeConnector () {
    // iOS: wait 5 seconds to close the connector in case it was not closed automatically by url redirect
    if (Platform.OS === 'ios') {
      clearTimeout(this._closeTimerId)
      this._closeTimerId = setTimeout(() => {
        this._isConnectorOpen && this._closeAuth()
        this._isConnectorOpen = false
      }, 5000)
    // Android: setTimeout no longer works when app is in background
    } else {
      this._closeAuth()
      this._isConnectorOpen = false
    }
  }

  _triggerCallback (type, data) {
    if (this._isConnecting) {
      this._isConnecting = false

      if (type === CONNECTION_SUCCESS && this._onConnection) {
        this._onConnection(data)
      }

      if (type === CONNECTION_FAILURE && this._onError) {
        this._onError(data)
      }
    }
  }

  async _isConnectAvailable () {
    return RNInAppBrowser.isAvailable()
  }

  async _openAuth (url, redirectUrl, options) {
    if (authSessionIsNativelySupported()) {
      return openAuthSessionAsync(url, redirectUrl, options)
    }

    return openAuthSessionPolyfillAsync(url, redirectUrl, options)
  }

  async _closeAuth () {
    closeAuthSessionPolyfillAsync()
    if (authSessionIsNativelySupported()) {
      RNInAppBrowser.closeAuth()
    } else {
      RNInAppBrowser.close()
    }
  }
}

export default API
