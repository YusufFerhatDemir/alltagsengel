import { Tabs } from 'expo-router'
import { Text, type ColorValue } from 'react-native'
import { Colors, Fonts } from '../../constants/theme'

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.ink4,
        tabBarStyle: {
          backgroundColor: Colors.coal2,
          borderTopColor: Colors.cardBorder,
        },
        tabBarLabelStyle: { fontFamily: Fonts.semibold, fontSize: 11 },
        sceneStyle: { backgroundColor: Colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Start', tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="budgetrechner"
        options={{ title: 'Budget', tabBarIcon: ({ color }) => <TabIcon symbol="€" color={color} /> }}
      />
      <Tabs.Screen
        name="pflegegrad-check"
        options={{ title: 'Pflegegrad', tabBarIcon: ({ color }) => <TabIcon symbol="✓" color={color} /> }}
      />
      <Tabs.Screen
        name="einzugsgebiet"
        options={{ title: 'Gebiet', tabBarIcon: ({ color }) => <TabIcon symbol="◎" color={color} /> }}
      />
      <Tabs.Screen
        name="kontakt"
        options={{ title: 'Kontakt', tabBarIcon: ({ color }) => <TabIcon symbol="✉" color={color} /> }}
      />
      <Tabs.Screen
        name="einsatz"
        options={{ title: 'Einsatz', tabBarIcon: ({ color }) => <TabIcon symbol="🛡" color={color} /> }}
      />
    </Tabs>
  )
}
