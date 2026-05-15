import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Animated, Platform, Modal, TextInput } from 'react-native';
import { AudioModule, RecordingPresets, AudioRecorder } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';
import NavHeader from '../components/NavHeader';

import FontAwesome from '@expo/vector-icons/FontAwesome';

import { API_BASE_URL } from '../config/api';

const CHUNK_DURATION_SEC = 180; // 3 minutes

// Simple Waveform Component using Animated Bars (Memoized for performance)
const Waveform = React.memo(({ isRecording, isPaused }: { isRecording: boolean, isPaused: boolean }) => {
  const bars = Array.from({ length: 9 }).map((_, i) => {
    const anim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
      if (isRecording && !isPaused) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: Math.random() * 60 + 20,
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 20,
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            })
          ])
        ).start();
      } else {
        anim.stopAnimation();
        Animated.timing(anim, { toValue: 5, duration: 200, useNativeDriver: false }).start();
      }
    }, [isRecording, isPaused]);

    return (
      <Animated.View
        key={i}
        style={[styles.waveBar, { height: anim, opacity: isPaused ? 0.3 : 1 }]}
      />
    );
  });

  return <View style={styles.waveformContainer}>{bars}</View>;
});

export default function RecorderScreen({ navigation, user }: any) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Refs to manage seamless recording loop
  const recorderRef = useRef<AudioRecorder | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedBeforePauseRef = useRef<number>(0);
  const elapsedRef = useRef(0);
  const isPausedRef = useRef(false);

  // Final URI collected when recording is completely stopped
  const [finalAudioUri, setFinalAudioUri] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
    };
  }, []);

  const createRecordingObject = async () => {
    const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
    return recorder;
  };

  const uploadChunk = async (uri: string, sId: string, cIndex: number): Promise<boolean> => {
    try {
      const formData = new FormData();

      // Handle URI formatting for different platforms
      let formattedUri = uri;
      if (Platform.OS === 'android' && !uri.startsWith('file://')) {
        formattedUri = `file://${uri}`;
      }

      // React Native FormData requires specific file object structure
      const fileObject = {
        uri: formattedUri,
        name: `chunk_${cIndex}.m4a`,
        type: 'audio/m4a',
      } as any;

      formData.append("audio", fileObject);
      formData.append("session_id", sId);
      formData.append("user_id", user?.id || "");
      formData.append("chunk_index", cIndex.toString());

      console.log(`[UPLOADING] Chunk ${cIndex} | Session: ${sId} | User: ${user?.id} | URI: ${formattedUri}`);

      await axios.post(`${API_BASE_URL}/upload-chunk`, formData, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 mins for large uploads
      });
      
      console.log(`[SUCCESS] Chunk ${cIndex} uploaded.`);
      return true;
    } catch (err: any) {
      console.error(`Failed to upload chunk ${cIndex}:`, err.message);
      console.error(`Full error:`, err);
      console.error(`Response status:`, err.response?.status);
      console.error(`Response data:`, err.response?.data);
      return false;
    }
  };

  const backgroundChunking = async () => {
    if (!recorderRef.current || !sessionIdRef.current || isPausedRef.current) return;

    console.log(`--- Reached ${CHUNK_DURATION_SEC} seconds! Performing seamless chunking ---`);
    const oldRecorder = recorderRef.current;
    const oldChunkIndex = chunkIndexRef.current;

    // Instantly start new recording
    const newRecorder = await createRecordingObject();
    recorderRef.current = newRecorder;
    chunkIndexRef.current += 1;

    // Process old recording safely in background
    const uri = oldRecorder.uri;
    if (uri) {
      await oldRecorder.stop();
      uploadChunk(uri, sessionIdRef.current, oldChunkIndex);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (permission.status === 'granted') {
        // Initialize Session
        sessionIdRef.current = `session-${Date.now()}`;
        chunkIndexRef.current = 0;
        elapsedRef.current = 0;
        elapsedBeforePauseRef.current = 0;
        startTimeRef.current = Date.now();
        isPausedRef.current = false;
        setRecordingTime(0);
        setIsPaused(false);
        setFinalAudioUri(null);

        // Start first recording
        recorderRef.current = await createRecordingObject();
        setIsRecording(true);

        // Start High-Precision Timer (Check every 100ms)
        timerRef.current = setInterval(() => {
          if (isPausedRef.current) return;

          const now = Date.now();
          const totalElapsedSec = Math.floor((now - startTimeRef.current + elapsedBeforePauseRef.current) / 1000);

          if (totalElapsedSec !== elapsedRef.current) {
            elapsedRef.current = totalElapsedSec;
            setRecordingTime(totalElapsedSec);

            // Trigger chunking exactly every CHUNK_DURATION_SEC
            if (totalElapsedSec > 0 && totalElapsedSec % CHUNK_DURATION_SEC === 0) {
              backgroundChunking();
            }
          }
        }, 100);
      } else {
        Alert.alert('Permission needed', 'Please grant microphone access to record notes.');
      }
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const togglePause = async () => {
    if (!recorderRef.current) return;

    if (isPausedRef.current) {
      // RESUME
      isPausedRef.current = false;
      setIsPaused(false);
      startTimeRef.current = Date.now(); // Restart the clock for the new interval
      await recorderRef.current.record();
    } else {
      // PAUSE
      isPausedRef.current = true;
      setIsPaused(true);
      // Store what we have recorded so far
      elapsedBeforePauseRef.current += (Date.now() - startTimeRef.current);
      await recorderRef.current.pause();
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;

    // The UI stops listening
    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;

    if (timerRef.current) clearInterval(timerRef.current);

    // Stop final chunk
    const uri = recorderRef.current.uri;
    await recorderRef.current.stop();
    recorderRef.current = null;

    if (uri) {
      setFinalAudioUri(uri);
      // Automatically generate notes immediately after stopping
      handleGenerateNotes(uri);
    }
  };

  const handleGenerateNotes = async (directUri?: string) => {
    if (!sessionIdRef.current) return;

    setIsProcessing(true);

    // Upload final chunk if it exists
    const uriToUpload = typeof directUri === 'string' ? directUri : finalAudioUri;
    if (uriToUpload) {
      const uploadSuccess = await uploadChunk(uriToUpload, sessionIdRef.current, chunkIndexRef.current);
      if (!uploadSuccess) {
        Alert.alert('Upload Failed', 'Could not upload audio to the server. Please check your network connection.');
        setIsProcessing(false);
        return;
      }
    }

    try {
      // Trigger finalize
      console.log(`[FINALIZE] Triggering finalization for ${sessionIdRef.current}...`);
      await axios.post(`${API_BASE_URL}/finalize`, {
        session_id: sessionIdRef.current,
        user_id: user?.id || "",
        participants: ["User"],
        speaker_timeline: [],
      });

      setIsProcessing(false);
      navigation.navigate('Notes', { sessionId: sessionIdRef.current });
    } catch (err) {
      console.error('Finalize Error:', err);
      Alert.alert('Error', 'There was an error generating your notes.');
      setIsProcessing(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        // Handle direct upload override
        setIsProcessing(true);
        const sId = `session-${Date.now()}`;
        const fileName = result.assets[0].name || "Imported Audio";
        const uploadSuccess = await uploadChunk(result.assets[0].uri, sId, 0);
        
        if (!uploadSuccess) {
          Alert.alert('Import Failed', 'Could not upload audio to the server. Please check your network connection.');
          setIsProcessing(false);
          return;
        }

        // Back-up finalize call
        await axios.post(`${API_BASE_URL}/finalize`, {
          session_id: sId,
          user_id: user?.id || "",
          participants: ["User"],
          speaker_timeline: [],
          title: fileName
        });

        setIsProcessing(false);
        navigation.navigate('Notes', { sessionId: sId });
      }
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <NavHeader title="" />

      <View style={styles.timerContainer}>
        <Text style={[styles.timerText, isPaused && styles.timerTextPaused]}>{formatTime(recordingTime)}</Text>
        <Text style={styles.timerSubtitle}>
          {isRecording ? (isPaused ? "Paused" : "Listening...") : "Tap to record your meeting"}
        </Text>
      </View>

      <View style={styles.centerSpace}>
        <Waveform isRecording={isRecording} isPaused={isPaused} />

        {isProcessing && (
          <View style={styles.processContainer}>
            <ActivityIndicator size="large" color="#284b63" />
            <Text style={styles.processingText}>Generating Notes ✨</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomControls}>
        {!isRecording ? (
          <>
            <TouchableOpacity style={styles.sideBtn} onPress={pickDocument} disabled={isProcessing}>
              <FontAwesome name="file-audio-o" size={24} color="#284b63" style={styles.uploadIcon} />
              <Text style={styles.uploadText}>Import Audio</Text>
            </TouchableOpacity>

            <View style={styles.recordOuterCircle}>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={startRecording}
                disabled={isProcessing}
              >
                <FontAwesome name="microphone" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.sideBtn} />
          </>
        ) : (
          <>
            <View style={styles.sideBtn} />

            {/* Center Pause/Resume Button */}
            <View style={[styles.recordOuterCircle, isPaused && { borderColor: '#284b63' }]}>
              <TouchableOpacity
                style={[styles.recordButton, isPaused ? { backgroundColor: '#284b63' } : { backgroundColor: '#284b63' }]}
                onPress={togglePause}
              >
                {isPaused ? (
                  <View style={styles.resumeTriangle} />
                ) : (
                  <View style={styles.pauseBars}>
                    <View style={styles.pauseBar} />
                    <View style={styles.pauseBar} />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Right Done/Stop Button */}
            <TouchableOpacity style={styles.doneBtn} onPress={stopRecording}>
              <View style={styles.doneSquare} />
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 50,
  },
  timerContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  timerText: {
    fontSize: 56,
    fontWeight: '300',
    color: '#353535',
    fontVariant: ['tabular-nums'],
  },
  timerTextPaused: {
    color: 'rgba(53, 53, 53, 0.6)',
  },
  timerSubtitle: {
    fontSize: 16,
    color: 'rgba(53, 53, 53, 0.5)',
    marginTop: 8,
  },
  centerSpace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    gap: 6,
  },
  waveBar: {
    width: 6,
    backgroundColor: '#284b63',
    borderRadius: 3,
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  sideBtn: {
    alignItems: 'center',
    width: 80,
  },
  recordOuterCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#284b63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#284b63',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseBars: {
    flexDirection: 'row',
    gap: 6,
  },
  pauseBar: {
    width: 6,
    height: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  resumeTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 16,
    borderRightWidth: 0,
    borderBottomWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: '#FFFFFF',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderTopColor: 'transparent',
    marginLeft: 4, // Visual balance
  },
  doneBtn: {
    alignItems: 'center',
    width: 60,
  },
  doneSquare: {
    width: 28,
    height: 28,
    backgroundColor: '#284b63',
    borderRadius: 6,
    marginBottom: 6,
  },
  doneText: {
    fontSize: 12,
    color: '#284b63',
    fontWeight: '600',
  },
  processContainer: {
    alignItems: 'center',
    marginTop: 30,
  },
  processingText: {
    color: '#284b63',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  uploadIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  uploadText: {
    fontSize: 11,
    color: 'rgba(53, 53, 53, 0.7)',
    fontWeight: '500',
    textAlign: 'center',
  },
  modalStartText: {
    color: '#fff',
    fontWeight: '700',
  }
});
