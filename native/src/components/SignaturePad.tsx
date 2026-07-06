import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { PanResponder, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Colors } from '../constants/theme'

// ═══════════════════════════════════════════════════════════
// SignaturePad — einfache Touch-zu-Pfad-Unterschriftserfassung mit
// react-native-svg (kein natives Zusatzmodul nötig). Wir haben
// react-native-signature-canvas geprüft: unklarer Support für die New
// Architecture (RN 0.86 / Expo SDK 57, standardmäßig aktiviert) und
// seit längerem kaum gepflegt — daher dieser pragmatische Eigenbau via
// PanResponder + Svg.Path. Svg.toDataURL() liefert direkt eine
// Base64-PNG, ganz ohne expo-gl/Canvas-Workaround.
// ═══════════════════════════════════════════════════════════

export interface SignaturePadHandle {
  /** Liefert die Unterschrift als Base64-PNG (ohne data:-Prefix), oder null wenn leer. */
  capture: () => Promise<string | null>
  clear: () => void
  isEmpty: () => boolean
}

interface Props {
  width: number
  height: number
}

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ width, height }, ref) {
  const [paths, setPaths] = useState<string[]>([])
  const currentPath = useRef('')
  const svgRef = useRef<React.ComponentRef<typeof Svg>>(null)
  const [, forceRender] = useState(0)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const { locationX, locationY } = evt.nativeEvent
        currentPath.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`
        forceRender(n => n + 1)
      },
      onPanResponderMove: evt => {
        const { locationX, locationY } = evt.nativeEvent
        currentPath.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`
        forceRender(n => n + 1)
      },
      onPanResponderRelease: () => {
        if (currentPath.current) {
          setPaths(prev => [...prev, currentPath.current])
          currentPath.current = ''
        }
      },
    })
  ).current

  useImperativeHandle(ref, () => ({
    isEmpty: () => paths.length === 0,
    clear: () => {
      setPaths([])
      currentPath.current = ''
    },
    capture: () =>
      new Promise(resolve => {
        if (paths.length === 0) {
          resolve(null)
          return
        }
        svgRef.current?.toDataURL((base64: string) => resolve(base64))
      }),
  }))

  return (
    <View style={[styles.pad, { width, height }]} {...panResponder.panHandlers}>
      <Svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke={Colors.ink} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {currentPath.current !== '' && (
          <Path d={currentPath.current} stroke={Colors.ink} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </Svg>
    </View>
  )
})

export default SignaturePad

const styles = StyleSheet.create({
  pad: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
  },
})
