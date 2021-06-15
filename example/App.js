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
  const [output, setOutput] = useState(null)

  useEffect(() => {
    setOutput('Loading SDk...')

    const init = async () => {
      try {
        await Zabo.init({
          clientId: '7uoeGj0Ei06SrOVbFe0BxztRHELAH9JWLIjXHh9vm0HmSrBbmhkHb9DdP7vgYB0Y', // REQUIRED
          env: 'sandbox', // REQUIRED
          apiVersion: 'v1' // OPTIONAL
        })

        setOutput('SDk is ready')
      } catch (err) {
        setOutput(`ERROR:\n${JSON.stringify(err)}`)
      }
    }

    init()
  }, [])

  const handleConnect = () => {
    const zabo = Zabo.instance
    const params = {
      redirect_uri: 'zabo-app://connected', // OPTIONAL
      origin: 'zabo-app' // OPTIONAL
    }
    zabo.connect({ params }).onConnection(account => {
      setOutput(`CONNECTED!\nACCOUNT:\n${JSON.stringify(account)}`)
    }).onError(err => {
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
              <TouchableOpacity onPress={handleConnect} style={styles.button}>
                <Text style={styles.buttonText}>CONNECT</Text>
              </TouchableOpacity>
            </View>
            {output &&
              <View style={styles.sectionContainer}>
                <Text>{output}</Text>
              </View>}
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
