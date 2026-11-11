// public/js/voice.js — Voice input (native online + Whisper-tiny int8 offline)
(function () {
  'use strict';

  const state = {
    mode: 'idle',
    browserSupport: null,
    recognition: null,
    mediaRecorder: null,
    audioChunks: [],
    whisperPipeline: null,
    whisperLoading: false,
    whisperProgress: 0,
    whisperError: null,
    modelReady: false
  };

  const MODEL_CACHE_KEY = 'kh_whisper_ready';

  function detectSupport() {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      state.browserSupport = 'native';
    } else if (navigator.mediaDevices && window.WebAssembly) {
      state.browserSupport = 'whisper';
    } else {
      state.browserSupport = null;
    }
    if (localStorage.getItem(MODEL_CACHE_KEY) === '1') {
      state.modelReady = true;
    }
  }

  // ------------------------------------------------------------------
  // Preload Whisper (callable from UI download button)
  // ------------------------------------------------------------------
  async function preloadWhisper(onProgress) {
    if (state.whisperPipeline) return state.whisperPipeline;
    if (state.whisperLoading) throw new Error('Model is already loading');

    state.whisperLoading = true;
    state.whisperError = null;
    state.whisperProgress = 0;

    try {
      if (onProgress) onProgress(0, 'Loading model library…');

      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      env.allowRemoteModels = true;
      env.useBrowserCache = true;

      if (onProgress) onProgress(5, 'Starting download…');

      state.whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        {
          quantized: true,
          progress_callback: (p) => {
            if (p.status === 'progress' && p.total) {
              const pct = Math.round((p.loaded / p.total) * 100);
              state.whisperProgress = pct;
              if (onProgress) onProgress(pct, `Downloading: ${pct}%`);
            }
          }
        }
      );

      state.modelReady = true;
      localStorage.setItem(MODEL_CACHE_KEY, '1');
      if (onProgress) onProgress(100, 'Voice model ready');
      return state.whisperPipeline;
    } catch (err) {
      state.whisperError = err.message || 'Model download failed';
      throw err;
    } finally {
      state.whisperLoading = false;
    }
  }

  // ------------------------------------------------------------------
  // Start listening
  // ------------------------------------------------------------------
  async function startListening(onResult, onError, onStateChange) {
    if (!state.browserSupport) {
      if (onError) onError('Voice input not supported on this device.');
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
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
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
  // Whisper WASM (offline, ~10MB int8 model)
  // ------------------------------------------------------------------
  async function startWhisperListening(onResult, onError, onStateChange) {
    try {
      if (!state.whisperPipeline) {
        if (!state.modelReady) {
          if (onError) onError('Voice pack not downloaded yet. Tap "Download voice pack" first.');
          if (onStateChange) onStateChange('needs-download');
          return;
        }
        state.mode = 'transcribing';
        if (onStateChange) onStateChange('loading', 'Preparing offline voice…');
        await preloadWhisper((pct, msg) => {
          if (onStateChange) onStateChange('loading', msg);
        });
      }

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
          const result = await state.whisperPipeline(audioBuffer, {
            language: 'english',
            task: 'transcribe'
          });
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
      }, 8000);

    } catch (err) {
      state.mode = 'error';
      if (onError) onError(err.message || 'Voice input failed.');
      if (onStateChange) onStateChange('error');
    }
  }

  async function decodeAudio(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    return decoded.getChannelData(0);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  detectSupport();

  window.KH_VOICE = {
    isSupported: () => state.browserSupport !== null,
    getMode: () => state.browserSupport,
    getState: () => state.mode,
    isModelReady: () => state.modelReady,
    isModelLoading: () => state.whisperLoading,
    getProgress: () => state.whisperProgress,
    preloadWhisper,
    startListening,
    stopListening,
    clearModelCache: () => {
      localStorage.removeItem(MODEL_CACHE_KEY);
      state.modelReady = false;
      state.whisperPipeline = null;
    }
  };
})();