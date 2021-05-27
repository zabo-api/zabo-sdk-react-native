/**
 * @Copyright (c) 2019-present, Zabo, All rights reserved.
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
 */

'use strict'

import { NativeModules } from 'react-native'
import sdk from './sdk'
import { version } from '../package.json'
import { 
  authSessionIsNativelySupported,
  openAuthSessionAsync,
  openAuthSessionPolyfillAsync,
  closeAuthSessionPolyfillAsync
} from './utils'

const { ZaboSdkReactNative } = NativeModules

console.log('ZaboSdkReactNative', ZaboSdkReactNative)

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

async function isAvailable() {
  return ZaboSdkReactNative.isAvailable()
}

async function openAuth(url, redirectUrl, options) {
  if (authSessionIsNativelySupported()) {
    return openAuthSessionAsync(url, redirectUrl, options)
  } else {
    return openAuthSessionPolyfillAsync(url, redirectUrl, options)
  }
}

function closeAuth() {
  closeAuthSessionPolyfillAsync()
  if (authSessionIsNativelySupported()) {
    ZaboSdkReactNative.closeAuth()
  } else {
    ZaboSdkReactNative.close()
  }
}

export const ConnectWidget = {
  isAvailable,
  openAuth,
  closeAuth
}

export default new Zabo()
