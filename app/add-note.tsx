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

function getAssetExtension(asset: ImagePicker.ImagePickerAsset, fallback = 'jpg') {
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

export default function AddNoteScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('需要相册权限才能选择图片');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 9,
    });
    if (!result.canceled) {
      setImages(result.assets);
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
    if (!images.length) {
      setMessage('请选择要发布的图片');
      return;
    }

    setLoading(true);
    try {
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const keyList = images.map((_, index) => `${Date.now()}-${index}`);

      await Promise.all(
        images.map(async (asset, index) => {
          const mimeType = asset.mimeType || 'image/jpeg';
          const type = getAssetExtension(asset, mimeType.includes('png') ? 'png' : 'jpg');
          const result = await FileSystem.uploadAsync(apiUrl('/file/addnote'), asset.uri, {
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType,
            headers: await getAuthHeaders(false),
            parameters: {
              account: user.account,
              uploadId,
              key: keyList[index],
              index: String(index),
              hash: '0',
              type,
              base: mimeType,
            },
          });
          assertUploadOk(result);
        })
      );

      await postJson('/file/addnoteEnd', {
        account: user.account,
        uploadId,
        title: title.trim(),
        brief: brief.trim(),
        key: keyList,
        name: user.name || user.account,
        url: user.url || '',
      });
      setTitle('');
      setBrief('');
      setImages([]);
      setMessage('发布成功');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '发布失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '发布笔记' }} />
      <ThemedView style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.switchRow}>
            <Pressable style={styles.switchBtnActive}>
              <ThemedText style={styles.switchActiveText}>图文笔记</ThemedText>
            </Pressable>
            <Pressable style={styles.switchBtn} onPress={() => router.replace('/add-video')}>
              <ThemedText style={styles.switchText}>发布视频</ThemedText>
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

          <ThemedText style={styles.label}>图片</ThemedText>
          <Pressable style={styles.pickBtn} onPress={() => void pickImages()}>
            <ThemedText style={styles.pickText}>{images.length ? `已选择 ${images.length} 张图片` : '选择图片'}</ThemedText>
          </Pressable>
          {images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
              {images.map((item, index) => (
                <Image key={`${item.uri}-${index}`} source={{ uri: item.uri }} style={styles.previewImage} contentFit="cover" />
              ))}
            </ScrollView>
          ) : null}
          <ThemedText style={styles.tip}>图片会通过 expo-file-system 的 uploadAsync 直接上传到后端。</ThemedText>

          {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}

          <Pressable style={[styles.submitBtn, loading && styles.submitBtnDisabled]} disabled={loading} onPress={() => void onSubmit()}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <ThemedText style={styles.submitText}>发布笔记</ThemedText>
            )}
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
  previewRow: { gap: 8, paddingVertical: 2 },
  previewImage: { width: 82, height: 82, borderRadius: 8, backgroundColor: '#E5E5EA' },
  tip: { marginTop: 4, fontSize: 12, color: '#8E8E93' },
  message: { marginTop: 10, color: '#FF2442' },
  submitBtn: { marginTop: 14, height: 44, borderRadius: 10, backgroundColor: '#FF2442', alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
