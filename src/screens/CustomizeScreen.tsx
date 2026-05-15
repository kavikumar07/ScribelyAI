import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import NavHeader from '../components/NavHeader';
import NotesRenderer from '../components/NotesRenderer';

import { API_BASE_URL } from '../config/api';

export default function CustomizeScreen({ route, navigation }: any) {
  const { sessionId } = route.params;
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const insets = useSafeAreaInsets();

  // Chat history (local UI only)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! How would you like to rewrite or format these notes?" }
  ]);

  const handleCustomize = async (customPrompt = prompt) => {
    if (!customPrompt.trim()) return;

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', text: customPrompt }]);
    setPrompt('');
    setIsProcessing(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/reformat-notes`, {
        session_id: sessionId,
        instruction: customPrompt
      });

      const newNotes = response.data;
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: "I've reformatted the notes based on your request. Please review and click 'Save & Apply' if you're happy with the changes.",
        data: newNotes // Store the draft JSON here
      }]);
      setIsProcessing(false);
    } catch (err) {
      console.error('Error customizing notes:', err);
      Alert.alert('Error', 'Failed to customize notes. Please try again.');
      setMessages(prev => [...prev, { role: 'assistant', text: "Sorry, I ran into an error. Please try again." }]);
      setIsProcessing(false);
    }
  };

  const handleSave = async (data: any) => {
    setIsProcessing(true);
    try {
      await axios.post(`${API_BASE_URL}/update-notes`, {
        session_id: sessionId,
        data: data
      });

      Alert.alert('Success', 'Notes updated successfully!');
      navigation.goBack();
    } catch (err) {
      console.error('Error saving notes:', err);
      Alert.alert('Error', 'Failed to save notes. Please try again.');
      setIsProcessing(false);
    }
  };

  const renderBubble = (msg, index) => {
    const isUser = msg.role === 'user';
    return (
      <View key={index} style={[styles.bubbleWrapper, isUser ? styles.bubbleUserWrapper : styles.bubbleAiWrapper]}>
        {!isUser && <Text style={styles.aiAvatar}>✨</Text>}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAi]}>{msg.text}</Text>

          {msg.data && (
            <TouchableOpacity
              style={styles.previewCard}
              onPress={() => {
                setPreviewData(msg.data);
                setShowPreviewModal(true);
              }}
            >
              <Text style={styles.previewTitle}>Preview of Changes (Click to see full):</Text>
              <View style={styles.previewScroll}>
                {msg.data.session_title && <Text style={styles.previewText} numberOfLines={1}>Title: {msg.data.session_title}</Text>}
                {msg.data.session_overview && (
                  <Text style={styles.previewText} numberOfLines={3}>
                    Overview: {Array.isArray(msg.data.session_overview) ? msg.data.session_overview[0] : msg.data.session_overview}
                  </Text>
                )}
                <Text style={styles.previewText}>(And other sections updated...)</Text>
              </View>

              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => handleSave(msg.data)}
                disabled={isProcessing}
              >
                <Text style={styles.applyBtnText}>{isProcessing ? 'Saving...' : 'Save & Apply'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.container}
      >
        <NavHeader title="AI Assistant" />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {messages.map(renderBubble)}

          {isProcessing && (
            <View style={[styles.bubbleWrapper, styles.bubbleAiWrapper]}>
              <Text style={styles.aiAvatar}>✨</Text>
              <View style={[styles.bubble, styles.bubbleAi, { paddingHorizontal: 20 }]}>
                <ActivityIndicator color="#284b63" />
              </View>
            </View>
          )}

          {/* Suggestions if no user message yet */}
          {messages.length === 1 && (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionTitle}>Suggestions</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity style={styles.pill} onPress={() => handleCustomize("Make it shorter and more concise")}>
                  <Text style={styles.pillText}>Make it shorter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pill} onPress={() => handleCustomize("Format this entirely as bullet points")}>
                  <Text style={styles.pillText}>Use bullet points</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pill} onPress={() => handleCustomize("Translate the notes to Spanish")}>
                  <Text style={styles.pillText}>Translate to Spanish</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom + 10, 20) }]}>
          <TextInput
            style={styles.textInput}
            placeholder="Customize with AI..."
            placeholderTextColor="rgba(53, 53, 53, 0.5)"
            value={prompt}
            onChangeText={setPrompt}
            editable={!isProcessing}
            multiline={true}
            onSubmitEditing={() => {
              if (Platform.OS === 'ios') {
                // On iOS, multiline inputs often use a button to submit, 
                // but we keep this for hardware keyboards.
                handleCustomize(prompt);
              }
            }}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!prompt.trim() || isProcessing) && styles.sendBtnDisabled]}
            onPress={() => handleCustomize(prompt)}
            disabled={!prompt.trim() || isProcessing}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      <Modal
        visible={showPreviewModal}
        animationType="slide"
        onRequestClose={() => setShowPreviewModal(false)}
        statusBarTranslucent={true}
      >
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Customized Notes</Text>
            {previewData && <NotesRenderer ncgJson={previewData} />}
          </ScrollView>

          <View style={[styles.bottomToolbar, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom + 10, 25) : 25 }]}>
            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={() => setShowPreviewModal(false)}
              disabled={isProcessing}
            >
              <Text style={[styles.toolbarText, { color: '#353535' }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toolbarBtn, styles.primaryBtn]}
              onPress={() => {
                setShowPreviewModal(false);
                handleSave(previewData);
              }}
              disabled={isProcessing}
            >
              {isProcessing ? <ActivityIndicator color="white" /> : <Text style={styles.primaryBtnText}>Save & Apply</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-end',
  },
  bubbleUserWrapper: {
    justifyContent: 'flex-end',
  },
  bubbleAiWrapper: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    fontSize: 20,
    marginRight: 10,
    marginBottom: 5,
  },
  bubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 20,
  },
  bubbleUser: {
    backgroundColor: '#284b63',
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: '#d9d9d9',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTextAi: {
    color: '#353535',
  },
  applyBtn: {
    marginTop: 12,
    backgroundColor: '#284b63',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  previewCard: {
    marginTop: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(40, 75, 99, 0.2)',
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#284b63',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  previewScroll: {
    marginBottom: 10,
  },
  previewText: {
    fontSize: 13,
    color: '#353535',
    lineHeight: 18,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#d9d9d9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#284b63',
  },
  closeModalText: {
    fontSize: 16,
    color: '#353535',
    fontWeight: '600',
  },
  modalScroll: {
    padding: 24,
    paddingBottom: 40,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#d9d9d9',
    flexDirection: 'row',
  },
  suggestionsContainer: {
    marginTop: 20,
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(53, 53, 53, 0.6)',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  pill: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  pillText: {
    color: '#353535',
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#d9d9d9',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#d9d9d9',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    color: '#353535',
    maxHeight: 120,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#284b63',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(40, 75, 99, 0.3)',
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: -2,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#284b63',
    letterSpacing: -0.5,
    marginBottom: 8,
    marginTop: 20,
  },
  date: {
    fontSize: 14,
    color: 'rgba(53, 53, 53, 0.5)',
    marginBottom: 30,
    fontWeight: '500',
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
  toolbarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#353535',
  },
  primaryBtn: {
    backgroundColor: '#284b63',
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
