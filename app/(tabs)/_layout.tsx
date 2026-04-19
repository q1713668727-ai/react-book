import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/contexts/auth-context';
import PlayIcon from '@/public/icon/bofang.svg';
import HomeIcon from '@/public/icon/home.svg';
import CommentIcon from '@/public/icon/pinglun.svg';
import ProfileIcon from '@/public/icon/wode.svg';

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
          paddingTop: 6,
          paddingBottom: 6,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ color }) => <HomeIcon width={28} height={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="video"
        options={{
          title: '视频',
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ color }) => <PlayIcon width={28} height={28} color={color} />,
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
          tabBarIcon: ({ color }) => <CommentIcon width={28} height={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我',
          tabBarIcon: ({ color }) => <ProfileIcon width={28} height={28} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
});
