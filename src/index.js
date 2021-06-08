'use strict'

import sdk from './sdk'
import { version } from '../package.json'

class Zabo {
  async init (config = {}) {
    await sdk.init(config)
    return sdk
  }

  get instance () {
    return sdk
  }

  get version () {
    return version
  }
}

export default new Zabo()
