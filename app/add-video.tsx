import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { getAuthHeaders, postJson } from '@/lib/post-json';

type UploadEnvelope = {
  status?: number;
  message?: string;
};

function getVideoExtension(asset: ImagePicker.ImagePickerAsset, fallback = 'mp4') {
  const fromName = asset.fileName?.split('.').pop();
  const fromMime = asset.mimeType?.split('/').pop();
  return String(fromName || fromMime || fallback).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || fallback;
}

function assertUploadOk(result: FileSystem.FileSystemUploadResult) {
  let body: UploadEnvelope = {};
  try {
    body = JSON.parse(result.body || '{}') as UploadEnvelope;
  } catch {
    throw new Error(result.body ? result.body.slice(0, 120) : '上传响应解析失败');
  }
  if (result.status < 200 || result.status >= 300 || body.status !== 200) {
    throw new Error(body.message || `上传失败(${result.status})`);
  }
}

export default function AddVideoScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('需要相册权限才能选择视频');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (!result.canceled) {
      setVideo(result.assets[0]);
      setMessage(null);
    }
  }

  async function onSubmit() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!title.trim()) {
      setMessage('请填写标题');
      return;
    }
    if (!video) {
      setMessage('请选择要发布的视频');
      return;
    }
    setLoading(true);
    try {
      const videoType = getVideoExtension(video);
      const uploadResult = await FileSystem.uploadAsync(apiUrl('/video/addvideo'), video.uri, {
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'chunk',
        mimeType: video.mimeType || `video/${videoType}`,
        headers: await getAuthHeaders(false),
        parameters: {
          account: user.account,
          hash: '0',
          type: videoType,
        },
      });
      assertUploadOk(uploadResult);

      await postJson('/video/addvideoEnd', {
        account: user.account,
        title: title.trim(),
        brief: brief.trim(),
        name: user.name || user.account,
        url: user.url || '',
        type: videoType,
      });
      setTitle('');
      setBrief('');
      setVideo(null);
      setMessage('发布成功');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '发布失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '发布视频' }} />
      <ThemedView style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.switchRow}>
            <Pressable style={styles.switchBtn} onPress={() => router.replace('/add-note')}>
              <ThemedText style={styles.switchText}>图文笔记</ThemedText>
            </Pressable>
            <Pressable style={styles.switchBtnActive}>
              <ThemedText style={styles.switchActiveText}>发布视频</ThemedText>
            </Pressable>
          </View>

          <ThemedText style={styles.label}>标题</ThemedText>
          <TextInput value={title} onChangeText={setTitle} placeholder="请填写标题" style={styles.input} />

          <ThemedText style={styles.label}>正文</ThemedText>
          <TextInput
            value={brief}
            onChangeText={setBrief}
            placeholder="说说此刻心情"
            style={[styles.input, styles.textarea]}
            multiline
            textAlignVertical="top"
          />

          <ThemedText style={styles.label}>视频</ThemedText>
          <Pressable style={styles.pickBtn} onPress={() => void pickVideo()}>
            <ThemedText style={styles.pickText}>{video ? video.fileName || '已选择视频' : '选择视频'}</ThemedText>
          </Pressable>
          {video ? <Image source={{ uri: video.uri }} style={styles.videoPreview} contentFit="cover" /> : null}
          <ThemedText style={styles.tip}>视频会通过 expo-file-system 的 uploadAsync 上传，后端会生成封面并保存。</ThemedText>

          {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}

          <Pressable style={[styles.submitBtn, loading && styles.submitBtnDisabled]} disabled={loading} onPress={() => void onSubmit()}>
            {loading ? <ActivityIndicator color="#FFF" /> : <ThemedText style={styles.submitText}>发布视频</ThemedText>}
          </Pressable>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 34 },
  switchRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  switchBtn: { flex: 1, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' },
  switchBtnActive: { flex: 1, height: 36, borderRadius: 18, backgroundColor: '#FF2442', alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: 13 },
  switchActiveText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: { minHeight: 40, borderRadius: 10, backgroundColor: '#F4F4F6', paddingHorizontal: 12, fontSize: 14 },
  textarea: { minHeight: 120, paddingTop: 10 },
  pickBtn: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#FF2442', alignItems: 'center', justifyContent: 'center' },
  pickText: { color: '#FF2442', fontSize: 14, fontWeight: '700' },
  videoPreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#E5E5EA' },
  tip: { marginTop: 4, fontSize: 12, color: '#8E8E93' },
  message: { marginTop: 10, color: '#FF2442' },
  submitBtn: { marginTop: 14, height: 44, borderRadius: 10, backgroundColor: '#FF2442', alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
