import { LiveTeacherClient, QuizItem } from '../aiTeacherLiveService';

// Mock dependencies
jest.mock('../aiTeacherService', () => ({
  teacherApi: jest.fn().mockImplementation((action: string) => {
    if (action === 'session') {
      return Promise.resolve({
        token: 'auth_tokens/test_mock_token_12345',
        apiVersion: 'v1alpha',
        model: 'gemini-3.8-live',
        voiceName: 'Aoede',
        teacherName: 'AI Teacher',
        systemInstruction: 'You are an AI teacher.',
        subjects: [{ id: 'sub-1', name: 'Science', topics: 10 }],
        catalog: [],
        tools: [],
      });
    }
    return Promise.resolve({});
  }),
}));

describe('LiveTeacherClient & Gemini Audio Processing', () => {
  let mockCallbacks: any;
  let client: LiveTeacherClient;

  beforeEach(() => {
    mockCallbacks = {
      onStatusChange: jest.fn(),
      onSpeakingChange: jest.fn(),
      onTranscriptUpdate: jest.fn(),
      onError: jest.fn(),
      onNotice: jest.fn(),
      onSubjectChange: jest.fn(),
    };

    client = new LiveTeacherClient({
      prefs: {
        apiKey: '',
        apiMode: 'admin',
        voice: 'Aoede',
        teacherName: 'Test AI Teacher',
        preset: 'friendly',
        custom: '',
        language: 'auto',
      },
      isByok: false,
      apiKey: '',
      callbacks: mockCallbacks,
    });
  });

  afterEach(() => {
    client.disconnect();
    jest.clearAllMocks();
  });

  describe('LiveTeacherClient Lifecycle', () => {
    test('initializes with idle status and unmuted state', () => {
      expect(client.getStatus()).toBe('idle');
      expect(client.isMuted()).toBe(false);
    });

    test('toggleMute toggles muted state', () => {
      expect(client.toggleMute()).toBe(true);
      expect(client.isMuted()).toBe(true);
      expect(client.toggleMute()).toBe(false);
      expect(client.isMuted()).toBe(false);
    });

    test('disconnect sets status to ended and resets speaking', () => {
      client.disconnect();
      expect(client.getStatus()).toBe('ended');
      expect(mockCallbacks.onStatusChange).toHaveBeenCalledWith('ended');
    });

    test('reportQuizAnswer formats answer turn with option letter', () => {
      const quiz: QuizItem = {
        id: 'q1',
        question: 'What is H2O?',
        options: ['Hydrogen', 'Water', 'Oxygen', 'Salt'],
        correctIndex: 1,
      };

      client.reportQuizAnswer(quiz, 1);
      expect(mockCallbacks.onTranscriptUpdate).toHaveBeenCalled();
    });

    test('reportUnderstanding formats understanding choice turn', () => {
      client.reportUnderstanding('Chemical Bonding', 'got_it');
      expect(mockCallbacks.onTranscriptUpdate).toHaveBeenCalled();
    });

    test('answerBigQuestion formats answer turn', () => {
      client.answerBigQuestion('Explain photosynthesis', 'It converts sunlight into chemical energy');
      expect(mockCallbacks.onTranscriptUpdate).toHaveBeenCalled();
    });

    test('stopSpeaking resets speaking state and clears playback queue', async () => {
      await client.stopSpeaking();
      expect(mockCallbacks.onSpeakingChange).toHaveBeenCalledWith(false);
    });

    test('sendRealtimeAudio invokes onMicLevel callback', () => {
      mockCallbacks.onMicLevel = jest.fn();
      client.sendRealtimeAudio('bW9ja19hdWRpb19kYXRh', 0.08);
      expect(mockCallbacks.onMicLevel).toHaveBeenCalledWith(0.08);
    });

    test('sendRealtimeAudio suppresses low-RMS audio when teacher is playing audio (echo prevention shield)', () => {
      const mockWs = { send: jest.fn() };
      (client as any).ws = mockWs;
      (client as any).status = 'live';
      (client as any).isPlayingAudio = true;

      // Speaker leakage (< 0.040) should be dropped to prevent false self-interruption
      client.sendRealtimeAudio('c3BlYWtlcl9sZWFrYWdl', 0.015);
      expect(mockWs.send).not.toHaveBeenCalled();

      // Deliberate student speech (>= 0.040) triggers barge-in, once it has lasted two chunks in a row
      const stopSpy = jest.spyOn(client, 'stopSpeaking');
      client.sendRealtimeAudio('c3R1ZGVudF9zcGVha2luZw==', 0.06);
      expect(stopSpy).not.toHaveBeenCalled();
      client.sendRealtimeAudio('c3R1ZGVudF9zcGVha2luZw==', 0.06);
      expect(stopSpy).toHaveBeenCalled();
      expect(mockWs.send).toHaveBeenCalled();
      const sentPayload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentPayload.realtimeInput.mediaChunks[0].mimeType).toBe('audio/pcm;rate=16000');
      expect(sentPayload.realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000');
    });
  });
});
