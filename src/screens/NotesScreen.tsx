import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, TextInput, KeyboardAvoidingView, Platform, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import NavHeader from '../components/NavHeader';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import NotesRenderer from '../components/NotesRenderer';

import { API_BASE_URL } from '../config/api';

export default function NotesScreen({ route, navigation }: any) {
  const { sessionId } = route.params;
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [saving, setSaving] = useState(false);

  const timeoutRef = useRef<any>(null);

  const checkStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/status?session_id=${sessionId}`);
      setStatus(res.data);

      if (res.data.status === 'ready' || res.data.status === 'completed') {
        setLoading(false);
        if (!isEditing) {
          setEditedContent(res.data.content || '');
        }
      } else if (res.data.status === 'failed') {
        Alert.alert('Error', 'Processing failed');
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } else {
        timeoutRef.current = setTimeout(checkStatus, 2000);
      }
    } catch (err) {
      console.error('Error checking status:', err);
      timeoutRef.current = setTimeout(checkStatus, 2000);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (sessionId) {
        checkStatus();
      }

      // Override Android back button — reset stack so Home is the root
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        return true;
      });

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        backHandler.remove();
      };
    }, [sessionId])
  );

  const [exporting, setExporting] = useState(false);

  const downloadPdf = async () => {
    setExporting(true);
    try {
      // 1. Trigger on-demand generation
      const exportRes = await axios.post(`${API_BASE_URL}/export-pdf?session_id=${sessionId}`);
      const pdfPath = exportRes.data.pdf_url;

      // 2. Download the file
      const url = `${API_BASE_URL}${pdfPath}`;
      const fileName = pdfPath.split('/').pop() || 'Notes.pdf';
      const localUri = FileSystem.documentDirectory + fileName;

      const { uri } = await FileSystem.downloadAsync(url, localUri);

      // 3. Share/Save
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share your notes PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Downloaded!', `File saved to: ${uri}`);
      }
    } catch (err) {
      console.error('PDF export error:', err);
      Alert.alert('Error', 'Failed to generate or download PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await axios.post(`${API_BASE_URL}/update-notes`, {
        session_id: sessionId,
        data: { custom_notes: editedContent }
      });
      setIsEditing(false);
      await checkStatus();
      Alert.alert('Success', 'Notes updated successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save notes.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#284b63" style={styles.spinner} />
        <Text style={styles.loadingText}>Structuring Notes...</Text>
        <Text style={styles.loadingSubText}>AI is finalizing the document</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <NavHeader
          title=""
          rightAction={
            (status?.status === 'ready' || status?.status === 'completed') && !isEditing ? (
              <TouchableOpacity onPress={downloadPdf} style={styles.topDownloadBtn} disabled={exporting}>
                {exporting ? (
                  <ActivityIndicator size="small" color="#353535" />
                ) : (
                  <Text style={styles.topDownloadText}>Export PDF ⬇️</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          <Text style={styles.title}>Session Notes</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>

          {/* Content Display / Edit Mode */}
          <View style={styles.contentWrapper}>
            {isEditing ? (
              <TextInput
                style={styles.textInput}
                multiline
                value={editedContent}
                onChangeText={setEditedContent}
                autoFocus
              />
            ) : (
              status?.ncg_json ? (
                <NotesRenderer ncgJson={status.ncg_json} />
              ) : (
                <Text style={styles.contentText}>
                  {status?.content || 'No content available'}
                </Text>
              )
            )}
          </View>
        </ScrollView>

        {/* Bottom Toolbar */}
        <View style={[styles.bottomToolbar, { paddingBottom: Math.max(insets.bottom + 10, 20) }]}>
          {!isEditing ? (
            <>
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={() => {
                  setEditedContent(status?.content || '');
                  setIsEditing(true);
                }}
              >
                <Text style={styles.toolbarIcon}>✏️</Text>
                <Text style={styles.toolbarText}>Edit Text</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolbarBtn, styles.primaryBtn]}
                onPress={() => navigation.navigate('Customize', { sessionId, content: status?.content })}
              >
                <Text style={styles.primaryBtnText}>✨ Customize with AI</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={() => setIsEditing(false)}
                disabled={saving}
              >
                <Text style={[styles.toolbarText, { color: '#353535' }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolbarBtn, styles.primaryBtn]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.primaryBtnText}>Save</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 30 : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  spinner: {
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 20,
    color: '#353535',
    fontWeight: '700',
    marginBottom: 8,
  },
  loadingSubText: {
    fontSize: 14,
    color: 'rgba(53, 53, 53, 0.7)',
  },
  topDownloadBtn: {
    backgroundColor: '#d9d9d9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  topDownloadText: {
    color: '#353535',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#284b63',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    color: 'rgba(53, 53, 53, 0.5)',
    marginBottom: 30,
    fontWeight: '500',
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#284b63',
    marginBottom: 10,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 4,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#284b63',
    marginRight: 10,
  },
  topicText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
    flex: 1,
  },
  takeawayRow: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingLeft: 4,
  },
  takeawayBullet: {
    fontSize: 18,
    color: '#284b63',
    marginRight: 8,
    lineHeight: 24,
  },
  contentWrapper: {
    flex: 1,
  },
  contentText: {
    fontSize: 16,
    lineHeight: 26,
    color: '#353535',
    fontWeight: '400',
  },
  textInput: {
    fontSize: 16,
    lineHeight: 28,
    color: '#353535',
    minHeight: 400,
    textAlignVertical: 'top',
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  bottomToolbar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#d9d9d9',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  toolbarIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  toolbarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#353535',
  },
  primaryBtn: {
    backgroundColor: '#284b63', // Clean navy action
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  }
});
