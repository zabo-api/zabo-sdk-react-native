'use strict'

import API from './api'
import ZaboSDK from 'zabo-sdk-js/src/core/SDK'

class SDK extends ZaboSDK {
  async initAPI (params) {
    this.api = new API({
      apiVersion: this.apiVersion,
      env: this.env,
      ...params
    })
    await this.setEndpointAliases()
  }
}

export default new SDK()
