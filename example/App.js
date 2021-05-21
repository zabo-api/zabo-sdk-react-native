import React, { useEffect, useState } from 'react'
import {
  SafeAreaView,
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  Image,
  TouchableOpacity
} from 'react-native'

import Zabo from 'zabo-sdk-react-native'

const App = () => {
  const [zabo, setZabo] = useState(null)
  const [output, setOutput] = useState(null)

  useEffect(() => {
    setOutput('Loading SDk...')

    const init = async () => {
      try {
        const zabo = await Zabo.init({
          clientId: 'YOUR_CLIENT_ID',
          baseUrl: 'https://api.zabo.com',
          connectUrl: 'https://connect.zabo.com',
          env: 'sandbox',
          apiVersion: 'v1'
        })

        setZabo(zabo)
        setOutput('SDk is ready')
      } catch (err) {
        console.log(err)
        setOutput(`ERROR:\n${JSON.stringify(err)}`)
      }
    }

    init()
  }, [])

  const handleConnect = () => {
    const params = {
      redirect_uri: 'zabo-app://connected',
      origin: 'zabo-app'
    }
    zabo.connect({ params }).onConnection(account => {
      setOutput(`CONNECTED!\nACCOUNT:\n${JSON.stringify(account)}`)
    }).onError(err => {
      console.log(err)
      setOutput(`ERROR:\n${JSON.stringify(err)}`)
    })
  }

  return (
    <>
      <StatusBar barStyle='dark-content' />
      <SafeAreaView>
        <ScrollView
          contentInsetAdjustmentBehavior='automatic'
          style={styles.scrollView}
        >
          <View style={styles.header}>
            <Image
              source={require('./img/logo.png')}
              resizeMode='contain'
              style={styles.logo}
            />
            <Text style={styles.sectionTitle}>Zabo Connect Playground</Text>
          </View>
          <View style={styles.body}>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionDescription}>
                This is a <Text style={styles.highlight}>sandbox demo</Text> of Zabo Connect capabilities. Use this as a guideline to write your own production-ready code.
              </Text>
              <Text style={styles.sectionDescription}>
                Please visit the Zabo SDK docs for a full API documentation and more details.
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <TouchableOpacity onPress={handleConnect} style={styles.button} disabled={!zabo}>
                <Text style={styles.buttonText}>CONNECT</Text>
              </TouchableOpacity>
            </View>
            { output && 
              <View style={styles.sectionContainer}>
                <Text>{output}</Text>
              </View>
            }
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: '#efefef'
  },
  body: {
    backgroundColor: '#ffffff'
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000'
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: '#000000'
  },
  highlight: {
    fontWeight: '700'
  },
  header: {
    backgroundColor: '#ffffff',
    alignItems: 'center'
  },
  logo: {
    width: 300,
    height: 100
  },
  button: {
    backgroundColor: '#3465E0',
    marginVertical: 16,
    padding: 16,
    alignItems: 'center'
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff'
  }
})

export default App
