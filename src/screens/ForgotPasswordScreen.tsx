
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import FontAwesome from '@expo/vector-icons/FontAwesome';


import { API_BASE_URL } from '../config/api';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequestOTP = async () => {
    if (!email) return Alert.alert("Error", "Please enter your email");
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/forgot-password`, { email });
      setStep('verify');
      Alert.alert("Success", "OTP sent to your email!");
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.detail || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp) return Alert.alert("Error", "Please enter the OTP");
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/verify-otp`, { email, otp });
      setStep('reset');
    } catch (err: any) {
      Alert.alert("Error", "Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword) return Alert.alert("Error", "Please enter a new password");
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/reset-password`, { email, password: newPassword });
      Alert.alert("Success", "Password reset successfully! Please login.");
      navigation.navigate('Login');
    } catch (err: any) {
      Alert.alert("Error", "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#284b63', '#353535']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <FontAwesome name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>
            {step === 'request' && "Reset Password"}
            {step === 'verify' && "Verify OTP"}
            {step === 'reset' && "New Password"}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'request' && "Enter your email to receive a 6-digit verification code."}
            {step === 'verify' && `We've sent a code to ${email}`}
            {step === 'reset' && "Almost there! Choose a secure new password."}
          </Text>
        </View>

        <View style={styles.form}>
          {step === 'request' && (
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor="rgba(255,255,255,0.6)"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          )}

          {step === 'verify' && (
            <TextInput
              style={styles.input}
              placeholder="6-Digit Code"
              placeholderTextColor="rgba(255,255,255,0.6)"
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
            />
          )}

          {step === 'reset' && (
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="New Password"
                placeholderTextColor="rgba(255,255,255,0.6)"
                secureTextEntry={!showPassword}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)} 
                style={styles.eyeIcon}
              >
                <FontAwesome name={showPassword ? "eye" : "eye-slash"} size={18} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity 
            style={styles.button} 
            onPress={() => {
                if (step === 'request') handleRequestOTP();
                else if (step === 'verify') handleVerifyOTP();
                else handleResetPassword();
            }}
            disabled={loading}
          >
            {loading ? (
                <ActivityIndicator color="#284b63" />
            ) : (
                <Text style={styles.buttonText}>
                    {step === 'request' && "Send OTP"}
                    {step === 'verify' && "Verify Code"}
                    {step === 'reset' && "Reset Password"}
                </Text>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: 20,
    padding: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    marginBottom: 20,
  },
  eyeIcon: {
    padding: 15,
  },
  button: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#284b63',
    fontSize: 18,
    fontWeight: '700',
  },
});
