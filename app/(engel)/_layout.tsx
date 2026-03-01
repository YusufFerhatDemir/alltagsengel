import { Tabs } from 'expo-router'
import { Colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

export default function EngelLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: Colors.coal2, borderTopColor: Colors.coal3, borderTopWidth: 1, height: 85, paddingBottom: 24, paddingTop: 8 },
      tabBarActiveTintColor: Colors.gold,
      tabBarInactiveTintColor: Colors.ink4,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
    }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="buchungen" options={{ title: 'Aufträge', tabBarIcon: ({ color, size }) => <Ionicons name="clipboard" size={size} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} /> }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
    </Tabs>
  )
}
