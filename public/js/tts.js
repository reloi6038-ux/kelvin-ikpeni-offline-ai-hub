// public/js/tts.js — Text-to-speech controller
// Exposes window.KH_TTS
// Usage:
//   KH_TTS.speak("Hello students");
//   KH_TTS.speak(lessonContent, { rate: 0.9 });
//   KH_TTS.pause(); KH_TTS.resume(); KH_TTS.stop();
//   KH_TTS.setVoice('en-NG'); // or null for default
//   KH_TTS.setRate(0.95);
//   KH_TTS.onChange = (state) => console.log(state); // state: idle | speaking | paused

(function () {
  'use strict';

  const state = {
    supported: ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window),
    utterance: null,
    currentText: '',
    rate: 0.95,
    pitch: 1.0,
    voice: null,
    voiceURI: null,
    speaking: false,
    paused: false,
    voices: []
  };

  // ------------------------------------------------------------------
  // Voice loading
  // ------------------------------------------------------------------
  function loadVoices() {
    if (!state.supported) return;
    state.voices = window.speechSynthesis.getVoices();
  }

  if (state.supported) {
    loadVoices();
    // Chrome fires `voiceschanged` after initial load
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  function findBestVoice(langHint) {
    if (state.voices.length === 0) return null;
    const target = langHint || 'en-NG';

    // Exact match
    let v = state.voices.find((v) => v.lang === target);
    if (v) return v;

    // Language prefix match (e.g., 'en' matches 'en-NG', 'en-US', etc.)
    const prefix = target.split('-')[0];
    v = state.voices.find((v) => v.lang.startsWith(prefix + '-') || v.lang === prefix);
    if (v) return v;

    // Native voice preference for English
    if (prefix === 'en') {
      v = state.voices.find((v) => v.default && v.lang.startsWith('en'));
      if (v) return v;
      v = state.voices.find((v) => v.lang.startsWith('en'));
      if (v) return v;
    }

    return state.voices[0];
  }

  // ------------------------------------------------------------------
  // Clean text (markdown, HTML, special chars)
  // ------------------------------------------------------------------
  function cleanText(text) {
    if (!text) return '';
    return String(text)
      .replace(/<[^>]+>/g, ' ')             // strip HTML
      .replace(/\*\*(.+?)\*\*/g, '$1')      // strip ** **
      .replace(/_(.+?)_/g, '$1')            // strip _ _
      .replace(/[#*_`>]/g, ' ')             // other markdown chars
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);                       // cap length
  }

  // ------------------------------------------------------------------
  // Speak
  // ------------------------------------------------------------------
  function speak(text, options = {}) {
    if (!state.supported) {
      console.warn('TTS not supported on this device');
      return false;
    }

    stop(); // cancel any existing utterance

    const cleaned = cleanText(text);
    if (!cleaned) return false;

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = options.rate ?? state.rate;
    utterance.pitch = options.pitch ?? state.pitch;

    // Voice selection
    const voice = options.voice
      ? state.voices.find((v) => v.voiceURI === options.voice)
      : state.voice || findBestVoice(options.lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else if (options.lang) {
      utterance.lang = options.lang;
    }

    utterance.onstart = () => {
      state.speaking = true;
      state.paused = false;
      notifyChange();
    };
    utterance.onend = () => {
      state.speaking = false;
      state.paused = false;
      state.utterance = null;
      notifyChange();
    };
    utterance.onerror = (e) => {
      // 'canceled' fires when we call stop() — not a real error
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('TTS error:', e.error);
      }
      state.speaking = false;
      state.paused = false;
      state.utterance = null;
      notifyChange();
    };
    utterance.onpause = () => {
      state.paused = true;
      notifyChange();
    };
    utterance.onresume = () => {
      state.paused = false;
      notifyChange();
    };

    state.currentText = cleaned;
    state.utterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  // ------------------------------------------------------------------
  // Controls
  // ------------------------------------------------------------------
  function pause() {
    if (!state.supported) return;
    window.speechSynthesis.pause();
    state.paused = true;
    notifyChange();
  }

  function resume() {
    if (!state.supported) return;
    window.speechSynthesis.resume();
    state.paused = false;
    notifyChange();
  }

  function stop() {
    if (!state.supported) return;
    window.speechSynthesis.cancel();
    state.utterance = null;
    state.currentText = '';
    state.speaking = false;
    state.paused = false;
    notifyChange();
  }

  function setRate(rate) {
    state.rate = Math.max(0.5, Math.min(2.0, Number(rate) || 1.0));
  }

  function setPitch(pitch) {
    state.pitch = Math.max(0.5, Math.min(2.0, Number(pitch) || 1.0));
  }

  function setVoice(uriOrLang) {
    if (!uriOrLang) {
      state.voice = null;
      state.voiceURI = null;
      return;
    }
    // Try URI first
    let v = state.voices.find((x) => x.voiceURI === uriOrLang);
    if (!v) {
      // Try language prefix
      v = findBestVoice(uriOrLang);
    }
    if (v) {
      state.voice = v;
      state.voiceURI = v.voiceURI;
    }
  }

  // ------------------------------------------------------------------
  // State notifications
  // ------------------------------------------------------------------
  function notifyChange() {
    if (typeof KH_TTS.onChange === 'function') {
      try {
        KH_TTS.onChange(getStatus());
      } catch (err) {
        console.warn('KH_TTS.onChange error:', err);
      }
    }
  }

  function getStatus() {
    return {
      supported: state.supported,
      speaking: state.speaking,
      paused: state.paused,
      currentText: state.currentText.slice(0, 100),
      rate: state.rate,
      pitch: state.pitch,
      voice: state.voice ? { name: state.voice.name, lang: state.voice.lang, voiceURI: state.voice.voiceURI } : null
    };
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.KH_TTS = {
    speak,
    pause,
    resume,
    stop,
    setRate,
    setPitch,
    setVoice,
    getStatus,
    getVoices: () => state.voices.slice(),
    isSupported: () => state.supported,
    onChange: null   // set by client: KH_TTS.onChange = (state) => {...}
  };
})();