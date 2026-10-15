import { TeacherPrefs, personaPayload } from './aiTeacherPrefs';
import { teacherApi, TeacherSubject } from './aiTeacherService';
import { createEchoGate, ECHO_TAIL_MS } from './askAssistant/echoGate';
import { createStepPacer, waitUntilIdle } from './askAssistant/stepPacing';
import { teacherVoice, type PcmPlayer } from './teacherVoice';
import { KEEP_LANGUAGE } from './aiTeacherVoice';

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
}

export interface VisualItem {
  emoji: string;
  title: string;
  text?: string;
  group?: string;
}

export interface VisualData {
  kind: 'scene' | 'timeline' | 'steps' | 'compare' | 'keyterms';
  title: string;
  items: VisualItem[];
  caption?: string;
}

export type TranscriptItem =
  | { kind: 'text'; id: string; role: 'user' | 'teacher'; text: string; done: boolean }
  | { kind: 'slide'; id: string; title: string; bullets: string[] }
  | { kind: 'quiz'; id: string; quiz: QuizItem }
  | { kind: 'visual'; id: string; visual: VisualData }
  | { kind: 'bigq'; id: string; question: string; hint?: string }
  | { kind: 'understand'; id: string; topic?: string };

export interface LiveSessionData {
  token?: string;
  byok?: boolean;
  apiVersion: string;
  lockLevel?: string;
  model: string;
  voiceName: string;
  teacherName: string;
  systemInstruction: string;
  subjects: TeacherSubject[];
  catalog: any[];
  tools: any[];
}

export interface LiveCallbacks {
  onStatusChange: (status: LiveStatus) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onTranscriptUpdate: (updater: (prev: TranscriptItem[]) => TranscriptItem[]) => void;
  onError: (error: string) => void;
  onNotice: (notice: string | null) => void;
  onSubjectChange?: (subjectName: string) => void;
  onMicLevel?: (level: number) => void;
  /** The teacher finished a turn (the server's turn-complete signal); the argument is the running total. */
  onTurnComplete?: (turnsCompleted: number) => void;
}

/** Added to the reply of a shown step so the teacher explains it aloud, then carries on instead of ending its turn. */
const KEEP_GOING =
  "Shown on the student's screen. Now explain this step aloud properly: 3 to 5 clear sentences in simple words, saying what we are doing, how, and why, like teaching a beginner. Do this before anything else. Only when you have finished speaking, go on to the next step (call its tool). Never show a step without explaining it, and do not stop or ask whether to continue until the Answer step has been shown.";

/** Tools that put a card on the student's screen; with keepGoing they are paced to the teacher's voice. */
const PACED_TOOLS = new Set(['present_slide', 'show_visual', 'show_quiz', 'ask_big_question', 'check_understanding']);

/** How long after the speech should have finished the live client waits for the player's "played out" before assuming it. */
const PLAYBACK_GRACE_MS = 2000;

const GREETING = 'Hello! I have just joined the class. Greet me with: "Namaste! How can I help you today? Which subject would you like to study?" and ask which subject I want to study.';

async function decodeWebSocketData(data: any): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(new Uint8Array(data));
    }
    const bytes = new Uint8Array(data);
    let str = '';
    for (let i = 0; i < bytes.length; i += 1024) {
      str += String.fromCharCode(...bytes.subarray(i, Math.min(i + 1024, bytes.length)));
    }
    try {
      return decodeURIComponent(escape(str));
    } catch {
      return str;
    }
  }
  if (data && typeof data.text === 'function') {
    return await data.text();
  }
  if (typeof FileReader !== 'undefined' && data) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsText(data);
    });
  }
  return String(data);
}

export class LiveTeacherClient {
  private ws: WebSocket | null = null;
  private status: LiveStatus = 'idle';
  private speaking: boolean = false;
  private muted: boolean = false;
  private callbacks: LiveCallbacks;
  private prefs: TeacherPrefs;
  private isByok: boolean;
  private apiKey: string;

  // The teacher's speech goes to the player chunk by chunk as it arrives; the player plays the chunks back to back
  // (see teacherVoice.ts), so there is nothing here to buffer, convert or write to disk.
  private player: PcmPlayer;
  private unlisten: (() => void) | null = null;
  /** Speech is queued or playing (set when a chunk is handed over, cleared when the player reports it played out). */
  private isPlayingAudio: boolean = false;
  /** When the speech handed over so far should be done playing, on the Date.now() clock. */
  private playUntil: number = 0;
  private playbackSafetyTimer: any = null;
  private streamedChunkCount: number = 0;
  // Generation fencing: audio from before an interruption is dropped.
  private currentGeneration: number = 0;
  private sessionHandle: string | null = null;
  private rollingHistory: { role: 'user' | 'teacher'; text: string }[] = [];

  // Consecutive over-threshold mic chunks while the teacher is speaking, used to
  // require sustained loudness (not a single speaker-leakage spike) before treating
  // mic input as a deliberate student barge-in.
  private bargeInStreak: number = 0;

  // Opt-in lecture-lesson behaviour (Ask AI in the player). All off by default, so the AI Teacher tab is unchanged.
  private echoGuard: boolean;
  private keepGoing: boolean;
  private subjectId?: string;
  private enrolledSubjects?: string;
  private gate = createEchoGate();
  private pacer = createStepPacer();
  private speakTail: ReturnType<typeof setTimeout> | null = null;
  private turnsCompleted: number = 0;

  // Live Transcript Turn State
  private currentTurnText: string = '';
  private currentTurnMsgId: string = '';
  private currentStudentTurnText: string = '';
  private currentStudentTurnMsgId: string = '';

  constructor(opts: {
    prefs: TeacherPrefs;
    isByok: boolean;
    apiKey: string;
    callbacks: LiveCallbacks;
    /** On speakers: keep the mic closed while the teacher talks, and let the student break in with interrupt(). */
    echoGuard?: boolean;
    /** A lesson in steps: tool replies tell the teacher to explain each step aloud and carry on; cards wait for the voice. */
    keepGoing?: boolean;
    /** Ground search_notes in this subject's real notes (instead of a stub). */
    subjectId?: string;
    /** Scope the teacher to these subjects. */
    enrolledSubjects?: string;
    /** Where the teacher's voice is played; the hidden WebView player unless a test gives another. */
    player?: PcmPlayer;
  }) {
    this.player = opts.player ?? teacherVoice;
    this.prefs = opts.prefs;
    this.isByok = opts.isByok;
    this.apiKey = opts.apiKey;
    this.callbacks = opts.callbacks;
    this.echoGuard = !!opts.echoGuard;
    this.keepGoing = !!opts.keepGoing;
    this.subjectId = opts.subjectId;
    this.enrolledSubjects = opts.enrolledSubjects;
  }

  public getStatus(): LiveStatus {
    return this.status;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopSpeaking();
      if (this.ws && this.status === 'live') {
        try {
          this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        } catch {}
      }
    }
    return this.muted;
  }

  /** The student taps to break in: the teacher stops now, and what is left of that turn is dropped. */
  public interrupt() {
    this.currentGeneration++;
    this.gate.interrupt(Date.now());
    this.stopSpeaking();
  }

  private setStatus(s: LiveStatus) {
    this.status = s;
    this.callbacks.onStatusChange(s);
  }

  /**
   * With the echo guard, "speaking" (and the closed mic) lasts a short tail after the last sound, so the orb only
   * shows "listening" once the mic really is open. An explicit stop (tap, mute, close) is immediate.
   */
  private setSpeaking(s: boolean, naturalEnd = false) {
    if (this.speakTail) {
      clearTimeout(this.speakTail);
      this.speakTail = null;
    }
    if (!this.echoGuard) {
      this.speaking = s;
      this.callbacks.onSpeakingChange(s);
      return;
    }
    if (s) {
      this.gate.playbackStarted();
      this.speaking = true;
      this.callbacks.onSpeakingChange(true);
    } else if (naturalEnd) {
      this.gate.playbackEnded(Date.now(), ECHO_TAIL_MS);
      this.speakTail = setTimeout(() => {
        this.speakTail = null;
        this.speaking = false;
        this.callbacks.onSpeakingChange(false);
      }, ECHO_TAIL_MS);
    } else {
      this.gate.playbackStopped(Date.now());
      this.speaking = false;
      this.callbacks.onSpeakingChange(false);
    }
  }

  public async connect(firstMessage?: string): Promise<void> {
    if (this.status === 'connecting' || this.status === 'live') return;

    this.setStatus('connecting');
    this.callbacks.onError('');
    this.callbacks.onNotice(null);
    this.listenToPlayer();

    try {
      // 1. Fetch live session config and token from SimpleLecture backend
      const sessionData = await teacherApi<LiveSessionData>('session', {
        persona: personaPayload(this.prefs),
        byok: this.isByok,
        isTesting: true,
        ...(this.enrolledSubjects ? { enrolledSubjects: this.enrolledSubjects } : {}),
      });

      const isConstrained = sessionData.token?.startsWith('auth_tokens/');
      const method = isConstrained ? 'BidiGenerateContentConstrained' : 'BidiGenerateContent';
      const param = isConstrained ? 'access_token' : 'key';
      const authKey = this.isByok ? this.apiKey.trim() : (sessionData.token || this.apiKey.trim());
      const apiVersion = sessionData.apiVersion || 'v1alpha';

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.${method}?${param}=${encodeURIComponent(authKey)}`;

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        // Send Gemini Multimodal Live session setup: request real AUDIO responses + bidirectional transcription!
        const setupMsg: any = {
          setup: {
            model: 'models/' + sessionData.model,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: sessionData.voiceName || 'Aoede',
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: this.getSystemInstructionWithHistory(sessionData.systemInstruction) }],
            },
            tools: sessionData.tools || [],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                prefixPaddingMs: 40,
                silenceDurationMs: 400,
              },
            },
            contextWindowCompression: { slidingWindow: {} },
          },
        };

        if (this.sessionHandle) {
          setupMsg.setup.sessionResumption = { handle: this.sessionHandle };
        }

        ws.send(JSON.stringify(setupMsg));
      };

      ws.onmessage = async (event: WebSocketMessageEvent) => {
        try {
          const raw = await decodeWebSocketData(event.data);
          const msg = JSON.parse(raw);

          // Session Resumption Handle Cache
          const resumptionHandle =
            msg.sessionResumptionUpdate?.newHandle ||
            msg.serverContent?.sessionResumptionUpdate?.newHandle;
          if (resumptionHandle) {
            this.sessionHandle = resumptionHandle;
          }

          // Setup complete: Session is live! Greet student
          if (msg.setupComplete) {
            this.setStatus('live');
            const initPrompt = firstMessage || GREETING;
            this.sendRealtimeContent(initPrompt, initPrompt === GREETING);
            return;
          }

          // Handle server content: real model audio turns & transcriptions
          if (msg.serverContent) {
            const sc = msg.serverContent;

            // Barge-in: if interrupted by user speech detected by Gemini VAD
            if (sc.interrupted) {
              console.log('[LiveTeacher] Gemini server detected student barge-in - triggering generation fence');
              this.currentGeneration++;
              this.gate.turnEnded();
              this.stopSpeaking();
            }

            // Real Gemini Audio Chunks (24kHz PCM) with generation fence
            if (sc.modelTurn?.parts) {
              const incomingGen = this.currentGeneration;
              for (const part of sc.modelTurn.parts) {
                if (part.inlineData?.data) {
                  this.handleAudioChunk(part.inlineData.data, incomingGen);
                }
              }
            }

            // Synchronized Transcript (Input from Student via Gemini Live ASR)
            if (sc.inputTranscription?.text) {
              this.handleStudentText(sc.inputTranscription.text);
            }

            // Synchronized Transcript (Output from Teacher)
            if (sc.outputTranscription?.text) {
              this.handleTeacherText(sc.outputTranscription.text);
            }

            // Turn Complete: Flush remaining audio to queue and close transcript bubbles
            if (sc.turnComplete) {
              this.finalizeTeacherTurn();
              this.finalizeStudentTurn();
              this.gate.turnEnded();
              this.turnsCompleted++;
              this.callbacks.onTurnComplete?.(this.turnsCompleted);
            }
          }

          // Handle tool calls: present_slide, show_quiz, show_visual, etc.
          if (msg.toolCall?.functionCalls) {
            await this.handleToolCalls(msg.toolCall.functionCalls, sessionData.catalog || []);
          }

          if (msg.goAway) {
            this.callbacks.onNotice('This class session is about to end. You can start a new class anytime.');
          }
        } catch (err: any) {
          console.warn('[LiveTeacher] Message parse error:', err);
        }
      };

      ws.onerror = (e: any) => {
        console.warn('[LiveTeacher] WebSocket error:', e?.message || e);
        this.callbacks.onError('Voice connection issue. Reconnecting...');
      };

      ws.onclose = (ev: WebSocketCloseEvent) => {
        const wasLive = this.status === 'live';
        this.cleanup();
        if (!wasLive && this.status === 'connecting') {
          this.setStatus('error');
          this.callbacks.onError('Could not connect to AI Teacher. Please check your network.');
        } else {
          this.setStatus('ended');
        }
      };
    } catch (err: any) {
      console.warn('[LiveTeacher] Connect error:', err);
      this.setStatus('error');
      this.callbacks.onError(err?.message || 'Could not start voice session.');
    }
  }

  // ==================== REAL GEMINI VOICE STREAMING ====================
  private handleAudioChunk(pcmChunkBase64: string, chunkGen?: number) {
    if (!pcmChunkBase64 || this.muted) return;
    if (typeof chunkGen === 'number' && chunkGen < this.currentGeneration) {
      return;
    }
    // A turn the student cut off by tapping: the server may still be sending its last words.
    if (this.echoGuard && !this.gate.acceptChunk(Date.now())) return;
    // 24 kHz, 16-bit mono: bytes / 2 / 24000 seconds.
    const chunkMs = ((pcmChunkBase64.length * 0.75) / 2 / 24000) * 1000;
    this.pacer.spoke(chunkMs);

    this.player.push(pcmChunkBase64);
    this.armPlaybackSafety(chunkMs);
    if (!this.isPlayingAudio) {
      this.isPlayingAudio = true;
      this.setSpeaking(true);
    }
  }

  private listenToPlayer() {
    this.unlisten?.();
    this.unlisten = this.player.listen({
      onDrained: () => this.onPlayerDrained(),
      onError: (message) => this.callbacks.onError(message),
    });
  }

  /**
   * The player says when the speech has played out. If that report never comes (the page failed, a message was
   * lost) this does it from the clock, so the orb and the mic never stay stuck on "speaking".
   */
  private armPlaybackSafety(chunkMs: number) {
    const now = Date.now();
    this.playUntil = Math.max(this.playUntil, now) + chunkMs;
    if (this.playbackSafetyTimer) clearTimeout(this.playbackSafetyTimer);
    this.playbackSafetyTimer = setTimeout(() => this.onPlayerDrained(), this.playUntil - now + PLAYBACK_GRACE_MS);
  }

  /** Everything handed to the player has been played. */
  private onPlayerDrained() {
    if (this.playbackSafetyTimer) {
      clearTimeout(this.playbackSafetyTimer);
      this.playbackSafetyTimer = null;
    }
    this.playUntil = 0;
    if (!this.isPlayingAudio) return;
    this.isPlayingAudio = false;
    this.setSpeaking(false, true);
  }

  public stopSpeaking() {
    if (this.playbackSafetyTimer) {
      clearTimeout(this.playbackSafetyTimer);
      this.playbackSafetyTimer = null;
    }
    this.playUntil = 0;
    this.player.stop();
    this.isPlayingAudio = false;
    this.setSpeaking(false);
  }

  // ==================== TRANSCRIPT HANDLING ====================
  private handleTeacherText(textChunk: string) {
    if (!textChunk) return;

    if (!this.currentTurnMsgId) {
      this.currentTurnMsgId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      this.currentTurnText = '';
      this.callbacks.onTranscriptUpdate((prev) => [
        ...this.closeAll(prev),
        { kind: 'text', id: this.currentTurnMsgId, role: 'teacher', text: textChunk, done: false },
      ]);
    } else {
      this.callbacks.onTranscriptUpdate((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'text' && last.role === 'teacher' && !last.done) {
          return [...prev.slice(0, -1), { ...last, text: last.text + textChunk }];
        }
        this.currentTurnMsgId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return [
          ...this.closeAll(prev),
          { kind: 'text', id: this.currentTurnMsgId, role: 'teacher', text: textChunk, done: false },
        ];
      });
    }

    this.currentTurnText += textChunk;
  }

  private finalizeTeacherTurn() {
    // The turn is over: a short reply still waiting out the player's head start plays now.
    this.player.flush();
    if (this.currentTurnText.trim()) {
      this.rollingHistory.push({ role: 'teacher', text: this.currentTurnText.trim() });
      if (this.rollingHistory.length > 20) this.rollingHistory.shift();
    }
    this.currentTurnMsgId = '';
    this.currentTurnText = '';
    this.callbacks.onTranscriptUpdate((prev) => this.closeAll(prev));
  }

  // ==================== STUDENT SPEECH & REALTIME AUDIO STREAMING ====================
  private handleStudentText(textChunk: string) {
    if (!textChunk) return;

    if (!this.currentStudentTurnMsgId) {
      this.currentStudentTurnMsgId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      this.currentStudentTurnText = '';
      this.callbacks.onTranscriptUpdate((prev) => [
        ...this.closeAll(prev),
        { kind: 'text', id: this.currentStudentTurnMsgId, role: 'user', text: textChunk, done: false },
      ]);
    } else {
      this.callbacks.onTranscriptUpdate((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'text' && last.role === 'user' && !last.done) {
          return [...prev.slice(0, -1), { ...last, text: last.text + textChunk }];
        }
        this.currentStudentTurnMsgId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return [
          ...this.closeAll(prev),
          { kind: 'text', id: this.currentStudentTurnMsgId, role: 'user', text: textChunk, done: false },
        ];
      });
    }

    this.currentStudentTurnText += textChunk;
  }

  private finalizeStudentTurn() {
    if (this.currentStudentTurnText.trim()) {
      this.rollingHistory.push({ role: 'user', text: this.currentStudentTurnText.trim() });
      if (this.rollingHistory.length > 20) this.rollingHistory.shift();
    }
    this.currentStudentTurnMsgId = '';
    this.currentStudentTurnText = '';
    this.callbacks.onTranscriptUpdate((prev) => this.closeAll(prev));
  }

  /**
   * Continuous raw mic audio streaming directly to Gemini Multimodal Live API.
   * With Intelligent Acoustic Shield (Echo Prevention):
   * - Hardware AEC is enabled in the capture stream.
   * - When teacher is speaking through the loudspeaker (isPlayingAudio == true):
   *   Low-level speaker leakage (< 0.040 RMS) is dropped to prevent the phone's speaker
   *   from echoing back into the teacher or falsely cutting off the teacher.
   *   If user deliberately speaks up (>= 0.040 RMS) or Gemini server VAD detects speech (sc.interrupted),
   *   teacher audio is immediately silenced and generation fence is incremented.
   */
  public sendRealtimeAudio(pcmBase64: string, rms: number = 0) {
    if (this.callbacks.onMicLevel) {
      this.callbacks.onMicLevel(rms);
    }

    if (!this.ws || this.status !== 'live' || this.muted) return;

    // Echo Shield:
    if (this.echoGuard) {
      // Half-duplex: the mic is not streamed while the teacher is audible (and for a short tail), so it can
      // never hear itself; the student breaks in by tapping the orb (see interrupt()).
      if (this.gate.micClosed(Date.now())) return;
    } else if (this.isPlayingAudio) {
      // In mobile WebAudio, phone speaker leakage into the mic is around 0.008 - 0.025.
      // Dropping this leakage prevents the teacher from self-interrupting!
      // Deliberate student barge-in (rms >= 0.040) or Gemini server VAD (sc.interrupted) silences playback.
      if (rms >= 0.040) {
        this.bargeInStreak++;
        // Require 2 consecutive loud mic chunks (~100-150ms) before cutting the teacher
        // off — a single spike is more likely a loud word bleeding into the mic than the
        // student actually interrupting, and acting on it mid-sentence is what caused
        // the audible "stuck/garbled" cut students were hearing.
        if (this.bargeInStreak < 2) {
          return;
        }
        console.log('[LiveTeacher] Student intentional barge-in detected (RMS:', rms.toFixed(3), ') - silencing teacher audio');
        this.bargeInStreak = 0;
        this.currentGeneration++;
        this.stopSpeaking();
      } else {
        // Drop loudspeaker leakage while teacher is speaking
        this.bargeInStreak = 0;
        return;
      }
    } else if (this.bargeInStreak !== 0) {
      this.bargeInStreak = 0;
    }

    try {
      const payload = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm;rate=16000',
              data: pcmBase64,
            },
          ],
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: pcmBase64,
          },
        },
      };
      this.ws.send(JSON.stringify(payload));
      this.streamedChunkCount++;
      if (this.streamedChunkCount % 20 === 1) {
        console.log(
          `[LiveTeacher] Streamed mic chunk #${this.streamedChunkCount} to Gemini (RMS: ${rms.toFixed(3)})`
        );
      }
    } catch (err) {
      console.warn('[LiveTeacher] Realtime audio send error:', err);
    }
  }

  private closeAll(items: TranscriptItem[]): TranscriptItem[] {
    return items.map((m) => (m.kind === 'text' && !m.done ? { ...m, done: true } : m));
  }

  private getSystemInstructionWithHistory(baseInstruction: string): string {
    if (this.rollingHistory.length === 0) return baseInstruction;
    const historyText = this.rollingHistory
      .slice(-10)
      .map((h) => `${h.role === 'user' ? 'Student' : 'Teacher'}: ${h.text}`)
      .join('\n');
    return `${baseInstruction}\n\n[Recent conversation context:\n${historyText}\nContinue teaching naturally from where we left off without greeting again.]`;
  }

  /**
   * Sends the student's text. `silent` is for requests the screen makes on the student's behalf (quick buttons,
   * "carry on" nudges): they reach the teacher but are not shown as something the student said.
   */
  public sendText(text: string, opts?: { silent?: boolean }) {
    const t = text.trim();
    if (!t) return;

    // Student speaking or typing barges in on the teacher
    this.currentGeneration++;
    this.stopSpeaking();

    if (!opts?.silent) {
      this.rollingHistory.push({ role: 'user', text: t });
      if (this.rollingHistory.length > 20) this.rollingHistory.shift();

      // Append student bubble to transcript
      this.callbacks.onTranscriptUpdate((prev) => [
        ...this.closeAll(prev),
        { kind: 'text', id: `u-${Date.now()}`, role: 'user', text: t, done: true },
      ]);
    }

    this.sendRealtimeContent(t, false);
  }

  private sendRealtimeContent(text: string, silent: boolean) {
    if (!this.ws || this.status !== 'live') return;

    try {
      const payload = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      };
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[LiveTeacher] Send error:', err);
    }
  }

  public reportQuizAnswer(quiz: QuizItem, optionIndex: number) {
    const correct = optionIndex === quiz.correctIndex;
    const letter = String.fromCharCode(65 + optionIndex);
    const chosen = quiz.options[optionIndex] || '';

    this.sendText(
      `I chose option ${letter}: "${chosen}". That is ${correct ? 'correct' : 'incorrect'}. Please continue. ${KEEP_LANGUAGE}`
    );
  }

  public reportUnderstanding(topic: string | undefined, choice: 'got_it' | 'somewhat' | 'confused') {
    const choiceText =
      choice === 'got_it'
        ? `I understood ${topic ? `"${topic}"` : 'this concept'} clearly!`
        : choice === 'somewhat'
        ? `I somewhat understood ${topic ? `"${topic}"` : 'this'}, but could you give one practical example?`
        : `I am confused about ${topic ? `"${topic}"` : 'this'}. Could you explain it again simply step-by-step?`;

    this.sendText(`${choiceText} ${KEEP_LANGUAGE}`);
  }

  public answerBigQuestion(question: string, answer: string) {
    this.sendText(`Here is my answer to "${question}":\n${answer}\n${KEEP_LANGUAGE}`);
  }

  /** The reply to a shown step: remembers it for the pacing and, in a lesson, tells the teacher to carry on. */
  private shownStepResponse() {
    this.pacer.shown();
    return this.keepGoing ? { status: 'shown', instruction: KEEP_GOING } : { status: 'shown' };
  }

  /** Real notes for the question from the subject's knowledge index; a stub when no subject is set or the lookup fails. */
  private async searchNotes(query: string) {
    if (this.subjectId) {
      try {
        const r = await teacherApi<{
          found: boolean;
          references?: { chapter_title?: string | null; topic_title?: string | null; heading_path?: string | null; content?: string }[];
        }>('search', { subjectId: this.subjectId, query });
        return {
          found: r.found,
          notes: (r.references || []).slice(0, 5).map((x) => ({
            source: [x.chapter_title, x.topic_title, x.heading_path].filter(Boolean).join(' > '),
            text: String(x.content || '').slice(0, 1000),
          })),
          instruction: r.found ? 'Teach only from these notes.' : 'Nothing relevant found. Tell the student it is not in their notes.',
        };
      } catch (err) {
        console.warn('[LiveTeacher] search_notes lookup failed, using a generic note:', err);
      }
    }
    return {
      found: true,
      notes: [{ source: 'Syllabus Notes', text: 'Key exam concepts regarding ' + query }],
      instruction: 'Teach from these syllabus notes concisely.',
    };
  }

  private async handleToolCalls(functionCalls: any[], catalog: any[]) {
    const responses: any[] = [];

    for (const fc of functionCalls) {
      const args = fc.args || {};
      const name = fc.name;

      try {
        // A lesson in steps: keep the board and the voice together (see stepPacing.ts).
        if (this.keepGoing && PACED_TOOLS.has(name)) {
          if (name === 'present_slide' || name === 'show_visual') {
            const verdict = this.pacer.request(String(args.title || ''));
            if (!verdict.allow) {
              responses.push({
                id: fc.id,
                name,
                response: { status: 'not_shown', instruction: verdict.instruction ?? 'Explain the previous step aloud first.' },
              });
              continue;
            }
          }
          // Speech is generated faster than it plays: play what is buffered, then show the card once the voice has caught up.
          this.player.flush();
          await waitUntilIdle({
            isIdle: () => !this.isPlayingAudio,
            isAborted: () => this.status !== 'live',
          });
        }
        if (name === 'present_slide') {
          const bullets = Array.isArray(args.bullets) ? args.bullets.map(String).slice(0, 8) : [];
          const title = String(args.title || 'Summary Slide');
          this.callbacks.onTranscriptUpdate((prev) => [
            ...this.closeAll(prev),
            { kind: 'slide', id: `s-${Date.now()}-${Math.random()}`, title, bullets },
          ]);
          responses.push({ id: fc.id, name, response: this.shownStepResponse() });
        } else if (name === 'show_quiz') {
          const options = Array.isArray(args.options) ? args.options.map(String).slice(0, 4) : [];
          const correctIndex = Number(args.correct_index) || 0;
          const quiz: QuizItem = {
            id: `q-${Date.now()}-${Math.random()}`,
            question: String(args.question || ''),
            options,
            correctIndex,
            explanation: args.explanation ? String(args.explanation) : null,
          };
          this.callbacks.onTranscriptUpdate((prev) => [
            ...this.closeAll(prev),
            { kind: 'quiz', id: quiz.id, quiz },
          ]);
          responses.push({ id: fc.id, name, response: { status: 'shown', note: "Wait for student's answer." } });
        } else if (name === 'show_visual') {
          const visual: VisualData = {
            kind: args.kind || 'steps',
            title: String(args.title || 'Visual Overview'),
            items: Array.isArray(args.items)
              ? args.items.map((i: any) => ({
                  emoji: String(i?.emoji || '📌'),
                  title: String(i?.title || ''),
                  text: i?.text ? String(i.text) : undefined,
                  group: i?.group ? String(i.group) : undefined,
                }))
              : [],
            caption: args.caption ? String(args.caption) : undefined,
          };
          this.callbacks.onTranscriptUpdate((prev) => [
            ...this.closeAll(prev),
            { kind: 'visual', id: `v-${Date.now()}-${Math.random()}`, visual },
          ]);
          responses.push({ id: fc.id, name, response: this.shownStepResponse() });
        } else if (name === 'check_understanding') {
          this.callbacks.onTranscriptUpdate((prev) => [
            ...this.closeAll(prev),
            { kind: 'understand', id: `u-${Date.now()}-${Math.random()}`, topic: args.topic ? String(args.topic) : undefined },
          ]);
          responses.push({ id: fc.id, name, response: { status: 'shown' } });
        } else if (name === 'ask_big_question') {
          this.callbacks.onTranscriptUpdate((prev) => [
            ...this.closeAll(prev),
            { kind: 'bigq', id: `bq-${Date.now()}-${Math.random()}`, question: String(args.question || ''), hint: args.hint ? String(args.hint) : undefined },
          ]);
          responses.push({ id: fc.id, name, response: { status: 'shown' } });
        } else if (name === 'select_subject') {
          if (args.subject && this.callbacks.onSubjectChange) {
            this.callbacks.onSubjectChange(String(args.subject));
          }
          responses.push({ id: fc.id, name, response: { status: 'selected', subject: args.subject } });
        } else if (name === 'search_notes') {
          responses.push({ id: fc.id, name, response: await this.searchNotes(String(args.query || '')) });
        } else {
          responses.push({ id: fc.id, name, response: { status: 'ok' } });
        }
      } catch (err: any) {
        responses.push({ id: fc.id, name, response: { status: 'error', message: err?.message || 'tool error' } });
      }
    }

    if (this.ws && this.status === 'live' && responses.length > 0) {
      try {
        const payload = {
          toolResponse: {
            functionResponses: responses,
          },
        };
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        console.warn('[LiveTeacher] Tool response send error:', err);
      }
    }
  }

  public disconnect() {
    this.stopSpeaking();
    this.cleanup();
    this.setStatus('ended');
  }

  private cleanup() {
    if (this.speakTail) {
      clearTimeout(this.speakTail);
      this.speakTail = null;
    }
    this.gate = createEchoGate();
    this.pacer = createStepPacer();
    try {
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      }
    } catch {
      // ignore
    }
    this.ws = null;
    this.stopSpeaking();
    this.unlisten?.();
    this.unlisten = null;
  }
}
