import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/contexts/auth-context';

function renderTabLabel(label: string) {
  function TabLabelRenderer({ focused, color }: { focused: boolean; color: string }) {
    return (
      <View style={styles.tabLabelContainer}>
        <Text style={[styles.tabLabel, focused && styles.tabLabelActive, { color }]}>{label}</Text>
      </View>
    );
  }

  return TabLabelRenderer;
}

function renderTabButton(props: BottomTabBarButtonProps) {
  return <HapticTab {...props} style={[props.style, styles.tabButton]} />;
}

export default function TabLayout() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#111111',
        tabBarInactiveTintColor: '#9D9D9D',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#EEEEEE',
          height: 56,
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: () => null,
        tabBarIconStyle: styles.tabIcon,
        tabBarLabelStyle: styles.tabLabelBox,
        headerShown: false,
        tabBarButton: renderTabButton,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarLabel: renderTabLabel('首页'),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: '集市',
          tabBarLabel: renderTabLabel('集市'),
        }}
      />
      <Tabs.Screen
        name="video"
        options={{
          href: null,
          title: '视频',
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarButton: () => (
            <Pressable style={styles.addBtn} onPress={() => router.push(user?.account ? '/publish' : '/login')}>
              <Image source={require('../../public/image/tianjia.png')} style={styles.addIcon} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: '消息',
          tabBarLabel: renderTabLabel('消息'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我',
          tabBarLabel: renderTabLabel('我'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    padding: 0,
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
  },
  tabIcon: {
    display: 'none',
    width: 0,
    height: 0,
  },
  tabLabelBox: {
    marginTop: 0,
    marginBottom: 0,
  },
  tabLabelContainer: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  tabLabelActive: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },
  addBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  addIcon: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
});
