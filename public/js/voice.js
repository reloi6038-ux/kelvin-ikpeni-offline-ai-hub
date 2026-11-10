// public/js/voice.js — Voice input (online Web Speech API + offline Whisper WASM)
(function () {
  'use strict';

  const state = {
    mode: 'idle',           // idle | listening | transcribing | error
    browserSupport: null,   // 'native' | 'whisper' | null
    recognition: null,
    mediaRecorder: null,
    audioChunks: [],
    whisperPipeline: null,
    whisperLoading: false,
    whisperProgress: 0
  };

  // ------------------------------------------------------------------
  // Detect capabilities
  // ------------------------------------------------------------------
  function detectSupport() {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      state.browserSupport = 'native';
      return;
    }
    if (navigator.mediaDevices && window.WebAssembly) {
      state.browserSupport = 'whisper';
      return;
    }
    state.browserSupport = null;
  }

  // ------------------------------------------------------------------
  // Public: start listening (online → native, offline → whisper)
  // ------------------------------------------------------------------
  async function startListening(onResult, onError, onStateChange) {
    if (!state.browserSupport) {
      const err = 'Voice input not supported on this device.';
      if (onError) onError(err);
      return;
    }

    const isOnline = typeof window.KH_IS_ONLINE === 'function'
      ? window.KH_IS_ONLINE()
      : navigator.onLine;

    if (isOnline && state.browserSupport === 'native') {
      startNativeListening(onResult, onError, onStateChange);
    } else {
      await startWhisperListening(onResult, onError, onStateChange);
    }
  }

  function stopListening() {
    if (state.recognition) {
      try { state.recognition.stop(); } catch {}
      state.recognition = null;
    }
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    state.mode = 'idle';
  }

  // ------------------------------------------------------------------
  // Native Web Speech API (online, instant)
  // ------------------------------------------------------------------
  function startNativeListening(onResult, onError, onStateChange) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = 'en-NG';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    state.recognition = rec;
    state.mode = 'listening';
    if (onStateChange) onStateChange('listening');

    let finalTranscript = '';

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      if (onStateChange) onStateChange('listening', finalTranscript + interim);
    };

    rec.onerror = (event) => {
      state.mode = 'error';
      const msg = event.error === 'no-speech'
        ? 'No speech detected. Try again.'
        : event.error === 'not-allowed'
          ? 'Microphone access denied. Check browser permissions.'
          : `Voice error: ${event.error}`;
      if (onError) onError(msg);
      if (onStateChange) onStateChange('error');
    };

    rec.onend = () => {
      state.mode = 'idle';
      state.recognition = null;
      if (finalTranscript.trim()) {
        if (onResult) onResult(finalTranscript.trim());
        if (onStateChange) onStateChange('done', finalTranscript.trim());
      } else {
        if (onStateChange) onStateChange('idle');
      }
    };

    try {
      rec.start();
    } catch (err) {
      if (onError) onError(err.message || 'Could not start microphone.');
    }
  }

  // ------------------------------------------------------------------
  // Whisper WASM (offline, one-time 40MB download)
  // ------------------------------------------------------------------
  async function startWhisperListening(onResult, onError, onStateChange) {
    try {
      // Load model if not loaded
      if (!state.whisperPipeline) {
        state.whisperLoading = true;
        state.mode = 'transcribing';
        if (onStateChange) onStateChange('loading', 'Loading offline speech model (first time only, ~40MB)…');

        const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        env.allowRemoteModels = true;
        env.useBrowserCache = true;

        state.whisperPipeline = await pipeline(
          'automatic-speech-recognition',
          'Xenova/whisper-tiny.en',
          {
            progress_callback: (p) => {
              if (p.status === 'progress' && p.total) {
                state.whisperProgress = Math.round((p.loaded / p.total) * 100);
                if (onStateChange) onStateChange('loading', `Loading model: ${state.whisperProgress}%`);
              }
            }
          }
        );
        state.whisperLoading = false;
      }

      // Record audio
      state.mode = 'listening';
      if (onStateChange) onStateChange('listening');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      state.mediaRecorder = mediaRecorder;
      state.audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());

        state.mode = 'transcribing';
        if (onStateChange) onStateChange('transcribing', 'Transcribing…');

        try {
          const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
          const audioBuffer = await decodeAudio(audioBlob);
          const result = await state.whisperPipeline(audioBuffer);
          const text = (result.text || '').trim();

          if (text) {
            if (onResult) onResult(text);
            if (onStateChange) onStateChange('done', text);
          } else {
            if (onError) onError('No speech detected.');
            if (onStateChange) onStateChange('idle');
          }
        } catch (err) {
          if (onError) onError('Transcription failed: ' + err.message);
          if (onStateChange) onStateChange('error');
        } finally {
          state.mode = 'idle';
          state.mediaRecorder = null;
        }
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
          state.mediaRecorder.stop();
        }
      }, 8000);  // auto-stop after 8 seconds

    } catch (err) {
      state.mode = 'error';
      if (onError) onError(err.message || 'Voice input failed.');
      if (onStateChange) onStateChange('error');
    }
  }

  // Decode audio blob to 16kHz mono Float32Array (Whisper requirement)
  async function decodeAudio(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = decoded.getChannelData(0);
    return channelData;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  detectSupport();

  window.KH_VOICE = {
    isSupported: () => state.browserSupport !== null,
    getMode: () => state.browserSupport,
    startListening,
    stopListening,
    getState: () => state.mode
  };
})();