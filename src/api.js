/**
 * @Copyright (c) 2019-present, Zabo & Modular, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @description: Zabo API communication library
 */
'use strict'

import { Linking, Platform } from 'react-native'
import { InAppBrowser } from 'react-native-inappbrowser-reborn'
import EncryptedStorage from 'react-native-encrypted-storage'
import axios from 'axios'

import constants from '../node_modules/zabo-sdk-js/src/constants'
import resources from '../node_modules/zabo-sdk-js/src/resources'
import utils from '../node_modules/zabo-sdk-js/src/utils'
import { SDKError } from '../node_modules/zabo-sdk-js/src/err'

import { getUrlParam } from './utils'
import { CONNECTION_FAILURE, CONNECTION_SUCCESS } from './constants'

const DEBUG_REQUESTS = false

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
        origin: encodeURIComponent(window.location.host),
        zabo_env: this.env,
        zabo_version: this.apiVersion || process.env.PACKAGE_VERSION,
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
      this._triggerCallback(CONNECTION_FAILURE, { error_type: 500, message: 'Connection refused' })
    }
  }

  async openUrl (url = '', redirectUri = '') {
    try {
      if (await InAppBrowser.isAvailable()) {
        const options = {
          ephemeralWebSession: false,
          animated: false
        }
        const res = await InAppBrowser.openAuth(url, redirectUri, options)
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
      this._triggerCallback(CONNECTION_FAILURE, { error_type: 500, message: 'Could not open the Connection Widget' })
    }

    return null
  }

  async request (method, path, data, isPublic = false) {
    const request = await this._buildRequest(method, path, data, isPublic)

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

  async _buildRequest (method, path, data, isPublic) {
    const url = this.baseUrl + path
    const _account = await this._getSession()
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
        this.ws = new window.WebSocket(wsUrl)
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
            this._setSession(data.account)
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

  async _setSession (account) {
    this._account = account
    EncryptedStorage.setItem('zabosession', JSON.stringify(account))
  }

  async _getSession () {
    if (this._account) {
      return this._account
    }

    const account = await EncryptedStorage.getItem('zabosession')
    if (account) {
      this._account = JSON.parse(account)
    }
    return this._account
  }

  async _deleteSession () {
    this._account = null
    EncryptedStorage.removeItem('zabosession')
  }

  _closeConnector () {
    // iOS: wait 5 seconds to close the connector in case it was not closed automatically by url redirect
    if (Platform.OS === 'ios') {
      clearTimeout(this._closeTimerId)
      this._closeTimerId = setTimeout(() => {
        this._isConnectorOpen && InAppBrowser.closeAuth()
        this._isConnectorOpen = false
      }, 5000)
    // Android: setTimeout no longer works when app is in background
    } else {
      InAppBrowser.closeAuth()
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
}

export default API
