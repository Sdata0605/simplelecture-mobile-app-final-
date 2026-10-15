import {
  getSubjects,
  getOutline,
  sendChatMessage,
  testGeminiApiKey,
  TeacherApiError,
} from '../aiTeacherService';
import { DEFAULT_PREFS } from '../aiTeacherPrefs';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  })),
}));

describe('aiTeacherService', () => {
  beforeEach(() => {
    (global as any).__fetchImpl = async () => {
      throw new Error('fetch not programmed for this test');
    };
  });

  describe('TeacherApiError', () => {
    it('creates an instance of Error with correct properties', () => {
      const err = new TeacherApiError('Custom error message', 404);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('TeacherApiError');
      expect(err.message).toBe('Custom error message');
      expect(err.status).toBe(404);
    });
  });

  describe('getSubjects', () => {
    it('fetches subject list via ai-teacher edge function', async () => {
      const mockSubjects = [
        { id: 'maths_10', name: 'Mathematics', topics: 45 },
        { id: 'science_10', name: 'Science', topics: 52 },
      ];

      (global as any).__fetchImpl = async (url: string, init: any) => {
        expect(url).toContain('/functions/v1/ai-teacher');
        const body = JSON.parse(init.body);
        expect(body.action).toBe('subjects');
        return {
          ok: true,
          status: 200,
          json: async () => ({ subjects: mockSubjects }),
        };
      };

      const result = await getSubjects();
      expect(result.subjects).toEqual(mockSubjects);
    });

    it('throws TeacherApiError if edge function returns an error status', async () => {
      (global as any).__fetchImpl = async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database query failed' }),
        };
      };

      await expect(getSubjects()).rejects.toThrow('Database query failed');
    });
  });

  describe('getOutline', () => {
    it('fetches chapter and topic outline for a given subject', async () => {
      const mockChapters = [
        {
          id: 'ch-1',
          number: 1,
          title: 'Arithmetic Progressions',
          topics: [{ id: 'top-1', label: '1.1', title: 'Introduction' }],
        },
      ];

      (global as any).__fetchImpl = async (url: string, init: any) => {
        const body = JSON.parse(init.body);
        expect(body.action).toBe('outline');
        expect(body.subjectId).toBe('maths_10');
        return {
          ok: true,
          status: 200,
          json: async () => ({ chapters: mockChapters }),
        };
      };

      const result = await getOutline('maths_10');
      expect(result.chapters).toEqual(mockChapters);
    });
  });

  describe('sendChatMessage', () => {
    it('routes managed ₹1000 plan through the backend edge function', async () => {
      const mockAnswer = 'Photosynthesis is the process by which green plants make food.';

      (global as any).__fetchImpl = async (url: string, init: any) => {
        const body = JSON.parse(init.body);
        expect(body.action).toBe('chat');
        expect(body.subjectId).toBe('science_10');
        expect(body.question).toBe('What is photosynthesis?');
        expect(body.persona).toBeDefined();
        expect(body.byok).toBeUndefined(); // Not byok for managed plan

        return {
          ok: true,
          status: 200,
          json: async () => ({
            found: true,
            topics: [],
            answer: mockAnswer,
          }),
        };
      };

      const res = await sendChatMessage({
        subjectId: 'science_10',
        question: 'What is photosynthesis?',
        prefs: DEFAULT_PREFS,
        isByok: false,
      });

      expect(res.found).toBe(true);
      expect(res.answer).toBe(mockAnswer);
    });

    it('throws TeacherApiError if BYOK plan is used without an API key', async () => {
      await expect(
        sendChatMessage({
          subjectId: 'science_10',
          question: 'Explain gravity',
          prefs: { ...DEFAULT_PREFS, apiKey: '' },
          isByok: true,
          apiKey: '',
        })
      ).rejects.toThrow('Your ₹500 plan requires your Google Gemini API key');
    });

    it('generates content directly with Google Gemini endpoint for BYOK plan', async () => {
      let edgeFunctionCalled = false;
      let geminiCalled = false;

      (global as any).__fetchImpl = async (url: string, init: any) => {
        if (url.includes('/functions/v1/ai-teacher')) {
          edgeFunctionCalled = true;
          const body = JSON.parse(init.body);
          expect(body.byok).toBe(true);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              found: true,
              mode: 'chat',
              topics: [],
              prepare: {
                system: 'You are an AI teacher.',
                contents: [{ role: 'user', parts: [{ text: 'Explain gravity' }] }],
                json: false,
                models: ['gemini-2.5-flash'],
              },
            }),
          };
        }

        if (url.includes('generativelanguage.googleapis.com')) {
          geminiCalled = true;
          expect(init.headers['x-goog-api-key']).toBe('AIzaSyValidKey');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'Gravity is the universal force of attraction.' }],
                  },
                },
              ],
            }),
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      };

      const result = await sendChatMessage({
        subjectId: 'science_10',
        question: 'Explain gravity',
        prefs: { ...DEFAULT_PREFS, apiKey: 'AIzaSyValidKey' },
        isByok: true,
      });

      expect(edgeFunctionCalled).toBe(true);
      expect(geminiCalled).toBe(true);
      expect(result.answer).toBe('Gravity is the universal force of attraction.');
    });

    it('correctly parses and formats quiz mode responses for BYOK plan', async () => {
      (global as any).__fetchImpl = async (url: string) => {
        if (url.includes('/functions/v1/ai-teacher')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              found: true,
              mode: 'quiz',
              topics: [],
              prepare: {
                system: 'Generate quiz JSON.',
                contents: [{ role: 'user', parts: [{ text: 'Quiz on Newton laws' }] }],
                json: true,
                models: ['gemini-2.5-flash'],
              },
            }),
          };
        }

        if (url.includes('generativelanguage.googleapis.com')) {
          const quizPayload = {
            question: 'What is Newton\'s First Law also known as?',
            options: ['Law of Inertia', 'Law of Force', 'Law of Action', 'Law of Energy'],
            correct_index: 0,
            explanation: 'It describes inertia of an object.',
          };
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: JSON.stringify(quizPayload) }],
                  },
                },
              ],
            }),
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      };

      const result = await sendChatMessage({
        subjectId: 'science_10',
        question: 'Quiz on Newton laws',
        mode: 'quiz',
        prefs: { ...DEFAULT_PREFS, apiKey: 'valid-key' },
        isByok: true,
      });

      expect(result.quiz).toBeDefined();
      expect(result.quiz?.question).toBe('What is Newton\'s First Law also known as?');
      expect(result.quiz?.options.length).toBe(4);
      expect(result.quiz?.correct_index).toBe(0);
      expect(result.quiz?.explanation).toBe('It describes inertia of an object.');
    });
  });

  describe('testGeminiApiKey', () => {
    it('returns ok: true when Google responds 200 to model probe', async () => {
      (global as any).__fetchImpl = async (url: string, init: any) => {
        expect(url).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash');
        expect(init.headers['x-goog-api-key']).toBe('AIzaSyValidKey');
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      };

      const res = await testGeminiApiKey('AIzaSyValidKey');
      expect(res.ok).toBe(true);
      expect(res.message).toContain('valid and working');
    });

    it('returns ok: false when Google responds with 400/401/403 status', async () => {
      (global as any).__fetchImpl = async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'API key not valid' } }),
        };
      };

      const res = await testGeminiApiKey('AIzaSyInvalidKey');
      expect(res.ok).toBe(false);
      expect(res.message).toContain('Google did not accept this key');
    });

    it('returns ok: false when a network error occurs', async () => {
      (global as any).__fetchImpl = async () => {
        throw new Error('Connection refused');
      };

      const res = await testGeminiApiKey('AIzaSyKey');
      expect(res.ok).toBe(false);
      expect(res.message).toContain('Could not connect to Google');
    });
  });
});
