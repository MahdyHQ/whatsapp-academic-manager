'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Phone, Lock, Shield, CheckCircle, AlertCircle, Loader2, ArrowRight, QrCode } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Your Railway API URL
  const API_URL = 'https://pleasant-eagerness-production-6be8.up.railway.app';

  const formatPhoneNumber = (value: string) => {
    let cleaned = value.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  };

  const requestOTP = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setAttemptsRemaining(null);

    try {
      const formattedPhone = formatPhoneNumber(phone);
      
      if (formattedPhone.length < 10) {
        throw new Error('Please enter a valid phone number with country code');
      }

      const response = await fetch(`${API_URL}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      setSuccess('Verification code sent to your WhatsApp!');
      setPhone(formattedPhone);
      setStep('code');
      
      // Show dev OTP if available (development mode)
      if (data.dev_otp) {
        console.log('🔑 DEV OTP:', data.dev_otp);
        // Optional: Show in UI for development
        setSuccess(`Code sent! DEV MODE: ${data.dev_otp}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    setLoading(true);
    setError('');
    setAttemptsRemaining(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        throw new Error(data.error || 'Invalid verification code');
      }

      // Store token and user info
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_phone', data.user.phone);
      localStorage.setItem('user_role', data.user.role);

      // Redirect to home
      setSuccess('Login successful! Redirecting...');
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-4 rounded-full">
              <Shield className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Academic Manager</h1>
          <p className="text-gray-600 mt-2">Secure Phone Authentication</p>
          <Badge variant="secondary" className="mt-3">
            Platform-Independent System
          </Badge>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl border-2 border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {step === 'phone' ? (
                <>
                  <Phone className="w-5 h-5 text-blue-600" />
                  Enter Your Phone Number
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5 text-blue-600" />
                  Enter Verification Code
                </>
              )}
            </CardTitle>
            <CardDescription>
              {step === 'phone' 
                ? 'We\'ll send a verification code to your WhatsApp' 
                : `Code sent to ${phone}`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {step === 'phone' ? (
              // Phone Number Step
              <form onSubmit={(e) => { e.preventDefault(); requestOTP(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                      placeholder="+201155547529"
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                      required
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Include country code (e.g., +20 for Egypt, +1 for USA)
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-600">{success}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading || !phone}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Sending Code...
                    </>
                  ) : (
                    <>
                      Send Verification Code
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>

                <div className="text-center pt-4 border-t">
                  <p className="text-sm text-gray-600 mb-2">Administrator?</p>
                  <a
                    href={`${API_URL}/qr`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <QrCode className="w-4 h-4" />
                    Scan QR Code to Connect WhatsApp
                  </a>
                </div>
              </form>
            ) : (
              // Verification Code Step
              <form onSubmit={(e) => { e.preventDefault(); verifyOTP(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-4 py-3 text-center text-2xl font-mono tracking-wider border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={6}
                    required
                    disabled={loading}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Enter the 6-digit code sent to your WhatsApp
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-red-600">{error}</p>
                        {attemptsRemaining !== null && (
                          <p className="text-xs text-red-500 mt-1">
                            {attemptsRemaining > 0 
                              ? `${attemptsRemaining} attempts remaining`
                              : 'Please request a new code'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-600">{success}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading || code.length !== 6}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Verify & Login
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                    setError('');
                    setSuccess('');
                    setAttemptsRemaining(null);
                  }}
                  disabled={loading}
                >
                  ← Back to Phone Number
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">Secure & Platform-Independent</h3>
                <p className="text-sm text-blue-700">
                  Your phone number is verified via WhatsApp. Only authorized numbers can access the system.
                  Works on Railway, AWS, DigitalOcean, and any hosting platform.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-600">
          <p>© 2025 Academic Manager by MahdyHQ</p>
          <p className="mt-1">Platform-Independent • Secure • Reliable</p>
        </div>
      </div>
    </div>
  );
}